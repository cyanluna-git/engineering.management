# Gateway Secrets and Rollout Controls

## Goal

Define the operational controls for the portal-first gateway model before the downstream handoff exchange rollout starts.

## Secret Ownership

| Secret | Owner | Consumers | Notes |
|---|---|---|---|
| `PORTAL_HANDOFF_SIGNING_KEY` | Portal runtime | None directly | Active signing secret for portal-issued handoff JWTs |
| `PORTAL_HANDOFF_VERIFY_KEY` | Service operator | EOB, OQC, Jarvis | Current verification secret trusted by downstream services |
| `PORTAL_HANDOFF_VERIFY_KEY_PREV` | Service operator | EOB, OQC, Jarvis | Previous verification secret kept during zero-downtime rotation |

For the initial HS256 rollout, the signing key and current verification key use the same secret value. They stay separated by variable name so a later asymmetric rollout can change values without renaming configuration.

## Gateway Modes

| Mode | Meaning | Expected Use |
|---|---|---|
| `direct` | Legacy direct login only | Safe default before migration |
| `gateway` | Portal-issued handoff accepted, direct login still available | Staged rollout mode |
| `gateway_only` | Reserve for future full cutover | Not required for the first migration |

Per-service flags:

- `GATEWAY_MODE_EOB`
- `GATEWAY_MODE_OQC`
- `GATEWAY_MODE_JARVIS`

## Rotation Procedure

1. Generate a new 32-byte secret with `scripts/gateway/rotate-handoff-key.sh`.
2. Roll out `PORTAL_HANDOFF_VERIFY_KEY_PREV=<current verify key>` to downstream services.
3. Roll out the new key as `PORTAL_HANDOFF_SIGNING_KEY` on portal and `PORTAL_HANDOFF_VERIFY_KEY` on downstream services.
4. Wait at least one handoff token TTL window plus a safety buffer.
5. Clear `PORTAL_HANDOFF_VERIFY_KEY_PREV`.

## Staged Rollout Sequence

1. Deploy secrets and flags everywhere with all services still set to `direct`.
2. Enable `GATEWAY_MODE_EOB=gateway` and validate the first handoff exchange path.
3. Monitor exchange success and failure logs before enabling the next service.
4. Enable `GATEWAY_MODE_OQC=gateway`.
5. Enable `GATEWAY_MODE_JARVIS=gateway`.

## Fallback and Rollback

### Fast per-service rollback

Set the affected service back to `direct` and restart the service. This immediately restores the legacy login path without rotating secrets.

### Emergency rotation

If a signing secret is compromised:

1. Set all downstream services to `direct`.
2. Rotate the signing and verification keys.
3. Re-enable services one at a time.

## Observability

Every gateway handoff exchange should emit a structured log event with:

- target service
- subject / user identifier
- token ID (`jti`) when present
- result (`success`, `disabled`, `invalid`, `user_not_found`, `inactive_user`)
- latency

Portal health should expose:

- whether a signing key is configured
- current token TTL
- which services are still `direct`
- which services are enabled for gateway mode
