<?php
// The status of a stored request by its delivery report: every channel delivered, some of them, or none.

declare(strict_types=1);

namespace Formgate\Channels;

enum DeliveryStatus: string
{
    case Delivered = 'delivered';
    case Partial = 'partial';
    case Failed = 'failed';
}
