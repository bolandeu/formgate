<?php
// One delivery attempt of a queued request, per channel: only the channels that did not accept the request yet get
// it. The results join the earlier ones, count for the channel states and are stored. On the schedule the request
// waits for the next repeat, and after the last one the operator gets an alert; a manual repeat has no schedule.

declare(strict_types=1);

namespace Formgate\Pro\Worker;

use DateTimeImmutable;
use Formgate\Channels\ChannelFactory;
use Formgate\Channels\DeliveryReport;
use Formgate\Channels\DeliveryStatus;
use Formgate\Pro\Alerts\ChannelStates;
use Formgate\Pro\Alerts\OperatorAlerts;
use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectRegistry;
use Formgate\Pro\Queue\Database;
use Formgate\Pro\Queue\Queue;
use Formgate\Pro\Queue\QueuedRequest;
use Formgate\Routing\Router;
use RuntimeException;
use Throwable;

final class RequestDelivery
{
    public function __construct(
        private readonly Queue $queue,
        private readonly ProjectRegistry $projects,
        private readonly ChannelStates $states,
        private readonly RepeatSchedule $schedule,
        private readonly OperatorAlerts $alerts,
    ) {
    }

    public static function create(ProConfig $config, Database $db, Queue $queue): self
    {
        $alerts = OperatorAlerts::fromConfig($config);
        return new self(
            $queue,
            new ProjectRegistry($config->projectsDir()),
            new ChannelStates($db, $alerts, $config->channelDownAfterFailures()),
            new RepeatSchedule($config->repeatScheduleSeconds()),
            $alerts,
        );
    }

    /** An attempt on the schedule: the request waits for the next repeat, or is not delivered after the last one. */
    public function onSchedule(QueuedRequest $queued, DateTimeImmutable $now): void
    {
        $report = $this->attempt($queued);
        $attempts = $queued->attempts + 1;
        $isDelivered = $report->status() === DeliveryStatus::Delivered;
        $nextAttemptAt = $isDelivered ? null : $this->schedule->nextAttemptAt($attempts, $now);
        $this->queue->record($queued->id, $report, $attempts, $nextAttemptAt);
        if (!$isDelivered && $nextAttemptAt === null) {
            $this->alerts->notDelivered($queued->projectKey, $queued->id, $report->failures());
        }
    }

    /** An attempt at once, out of the schedule; the request ends delivered or not delivered. */
    public function atOnce(QueuedRequest $queued): DeliveryReport
    {
        $report = $this->attempt($queued);
        $this->queue->record($queued->id, $report, $queued->attempts + 1, null);
        return $report;
    }

    /** The report of the request with the results of this attempt; a project that is gone or broken adds none. */
    private function attempt(QueuedRequest $queued): DeliveryReport
    {
        $report = $queued->report();
        try {
            $settings = $this->projects->find($queued->projectKey)
                ?? throw new RuntimeException("no project {$queued->projectKey}");
            $request = $queued->request($settings->timezone());
            foreach ((new Router($settings, new ChannelFactory()))->channelsFor($request) as $channelName => $channel) {
                if (!$queued->isDeliveredTo($channelName)) {
                    $result = $channel->send($request);
                    $report->add($channelName, $result);
                    $this->states->record($queued->projectKey, $channelName, $result);
                }
            }
        } catch (Throwable $error) {
            error_log("formgate: request {$queued->id} is not sent: " . $error->getMessage());
        }
        return $report;
    }
}
