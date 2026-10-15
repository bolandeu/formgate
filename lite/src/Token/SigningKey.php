<?php
// The key provider of time tokens: the secret that signs them. Lite keeps its own key in the storage place
// (StoredSigningKey); Pro gives its key from the environment.

declare(strict_types=1);

namespace Formgate\Token;

interface SigningKey
{
    /** True when the key is there; the self-check asks it and never makes the key. */
    public function exists(): bool;

    /** The secret; a provider that makes its key makes it here, on the first use. */
    public function secret(): string;
}
