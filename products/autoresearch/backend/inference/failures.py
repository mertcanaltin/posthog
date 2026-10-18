"""Classify a failed scoring run, and tell when the champion's scheduled runs show it cannot score."""

from collections.abc import Iterator
from datetime import date, timedelta
from enum import StrEnum

from django.db.models import QuerySet
from django.utils import timezone as django_timezone

import structlog

from posthog.dataclasses import frozen
from posthog.errors import QueryErrorCategory, classify_query_error

from products.autoresearch.backend.inference.sandbox import ModelLoadError
from products.autoresearch.backend.models import AutoresearchModel, AutoresearchRun

logger = structlog.get_logger(__name__)

# The inference workflow's execution timeout. It covers both activity attempts plus their backoff,
# so an inference run still RUNNING after this long lost its worker and no attempt can close it.
INFERENCE_WORKFLOW_TIMEOUT = timedelta(hours=5)


class FailureKind(StrEnum):
    LIMIT_EXCEEDED = "limit_exceeded"
    QUERY_FAILED = "query_failed"
    MODEL_LOAD_FAILED = "model_load_failed"
    # Transport, capture, cluster capacity, and every error this module does not recognize.
    OTHER = "other"


# These kinds fail again on the next run with the same champion. The other kinds can pass on a retry.
REPEATABLE_FAILURE_KINDS = frozenset(
    {FailureKind.LIMIT_EXCEEDED, FailureKind.QUERY_FAILED, FailureKind.MODEL_LOAD_FAILED}
)

# The number of consecutive scheduled scoring days with a repeatable failure that make a champion unscorable.
UNSCORABLE_AFTER_FAILED_DAYS = 2
# The scheduled runs one check reads. An activity retry adds a second run for the same day.
_RUNS_TO_SCAN = 20


def _exception_chain(exc: BaseException) -> Iterator[BaseException]:
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__


def classify_failure(exc: BaseException) -> FailureKind:
    """The kind of a scoring failure. The scoring code wraps query errors, so this reads the whole cause chain."""
    for error in _exception_chain(exc):
        if isinstance(error, ModelLoadError):
            return FailureKind.MODEL_LOAD_FAILED
        if not isinstance(error, Exception):
            continue
        category = classify_query_error(error)
        if category == QueryErrorCategory.QUERY_PERFORMANCE_ERROR:
            return FailureKind.LIMIT_EXCEEDED
        if category == QueryErrorCategory.USER_ERROR:
            return FailureKind.QUERY_FAILED
        if category != QueryErrorCategory.ERROR:
            # The wrapper decided first: cluster memory pressure keeps a raw MEMORY_LIMIT_EXCEEDED as its cause.
            return FailureKind.OTHER
    return FailureKind.OTHER


@frozen
class UnscorableChampion:
    failure_kind: str
    onset: date


def _run_date(run: AutoresearchRun) -> date:
    prediction_date = (run.metrics or {}).get("prediction_date")
    return date.fromisoformat(prediction_date) if prediction_date else run.created_at.date()


def find_unscorable_champion(champion: AutoresearchModel | None) -> UnscorableChampion | None:
    """
    Return the failure when the champion's scheduled runs failed with a repeatable kind on the
    last ``UNSCORABLE_AFTER_FAILED_DAYS`` scoring days, with no success after the first of them.

    Manual runs do not count, because a person can start them many times in one day. Failures of
    other kinds do not count, and do not break the streak either. The onset is the prediction date
    of the oldest repeatable failure after the last success.
    """
    if champion is None:
        return None
    runs = (
        AutoresearchRun.objects.for_team(champion.team_id)
        .filter(
            pipeline_id=champion.pipeline_id,
            model=champion,
            run_type=AutoresearchRun.RunType.INFERENCE,
            scheduled=True,
            status__in=(AutoresearchRun.Status.COMPLETED, AutoresearchRun.Status.FAILED),
        )
        .order_by("-created_at")[:_RUNS_TO_SCAN]
    )
    failed_days: dict[date, str] = {}
    for run in runs:
        if run.status == AutoresearchRun.Status.COMPLETED:
            break
        kind = (run.metrics or {}).get("failure_kind")
        if kind in REPEATABLE_FAILURE_KINDS:
            # The newest failure of a day wins, so the kind reported is the latest one.
            failed_days.setdefault(_run_date(run), kind)
    if len(failed_days) < UNSCORABLE_AFTER_FAILED_DAYS:
        return None
    newest_day = max(failed_days)
    return UnscorableChampion(failure_kind=failed_days[newest_day], onset=min(failed_days))


def _fail_lost_runs(runs: QuerySet[AutoresearchRun]) -> int:
    now = django_timezone.now()
    failed = 0
    for run in runs:
        run.status = AutoresearchRun.Status.FAILED
        run.error = "Scoring stopped without a result. The worker was lost or the attempt timed out."
        run.metrics["failure_kind"] = FailureKind.OTHER
        run.completed_at = now
        run.save(update_fields=["status", "error", "metrics", "completed_at"])
        failed += 1
    return failed


def fail_stale_inference_runs() -> int:
    """
    Fail every inference run, across all teams, that is still RUNNING after ``INFERENCE_WORKFLOW_TIMEOUT``.

    A lost worker, a heartbeat timeout, or a cancellation ends the attempt before the scoring code
    records an outcome. The kind is ``other``, so ``find_unscorable_champion`` does not count the run.
    This is the backstop for ``fail_lost_scheduled_runs``.
    """
    failed = _fail_lost_runs(
        AutoresearchRun.objects.unscoped().filter(
            run_type=AutoresearchRun.RunType.INFERENCE,
            status=AutoresearchRun.Status.RUNNING,
            started_at__lt=django_timezone.now() - INFERENCE_WORKFLOW_TIMEOUT,
        )
    )
    if failed:
        logger.warning("autoresearch_stale_inference_runs_failed", count=failed)
    return failed


def _scheduled_runs(team_id: int, pipeline_id: str, prediction_date: str) -> QuerySet[AutoresearchRun]:
    return AutoresearchRun.objects.for_team(team_id).filter(
        pipeline_id=pipeline_id,
        run_type=AutoresearchRun.RunType.INFERENCE,
        scheduled=True,
        metrics__prediction_date=prediction_date,
    )


def fail_lost_scheduled_runs(*, team_id: int, pipeline_id: str, prediction_date: str) -> int:
    """
    Fail the scheduled inference runs of one pipeline and date that are still RUNNING.

    Call it only after the inference workflow of that date has ended, because then no attempt can close them.
    """
    failed = _fail_lost_runs(
        _scheduled_runs(team_id, pipeline_id, prediction_date).filter(status=AutoresearchRun.Status.RUNNING)
    )
    if failed:
        logger.warning("autoresearch_lost_inference_runs_failed", pipeline_id=pipeline_id, count=failed)
    return failed


def scheduled_run_can_retry(*, team_id: int, pipeline_id: str, prediction_date: str) -> bool:
    """
    True when the latest scheduled run of the date failed with a kind that can pass on a retry.

    A pipeline with no scheduled run for the date returns False, because the daily sweep may not have reached it yet.
    """
    latest = _scheduled_runs(team_id, pipeline_id, prediction_date).order_by("-created_at").first()
    return (
        latest is not None
        and latest.status == AutoresearchRun.Status.FAILED
        and (latest.metrics or {}).get("failure_kind") not in REPEATABLE_FAILURE_KINDS
    )
