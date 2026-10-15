# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the EcoWatt client ID and secret, kept by Gladys in the integration configuration
  (the secret is a `secret` field, never returned to the browser). The integration sends them only
  to RTE's token endpoint, over HTTPS, and never writes them to the logs or to `/data`. The access
  token RTE returns lives in memory only.
- **`/data`**: `rte-state.json` holds the time of the last EcoWatt call (RTE's quota), the last
  EcoWatt signals read and the alerts already announced. No credential, no personal data.
- **Network**: outbound HTTPS only, to `odre.opendatasoft.com` (éCO2mix open data) and
  `digital.iservices.rte-france.com` (EcoWatt). No port is opened, nothing is reached on the local
  network.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)), and the RTE
services the integration reads.
