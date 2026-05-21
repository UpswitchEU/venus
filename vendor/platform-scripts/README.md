# @upswitch/platform-scripts

Versioned CLI entrypoints for shared UpSwitch platform guards.

Apps should call `upswitch-platform <command>` from `package.json` instead of
reaching directly into `../../scripts`. That gives first engineers one stable
contract surface while we continue migrating root-level scripts into packages.

Examples:

```sh
upswitch-platform verify:shared-contracts
upswitch-platform sync:shared-contracts
upswitch-platform verify:valuation-extract
```

The CLI currently delegates to the canonical root scripts and keeps command
names stable for Mercury, Venus, and Titan.

Because these guards compare files across apps and packages, they require a
full UpSwitch workspace checkout. The CLI resolves the workspace from the
current directory, from its installed package location, or from
`UPSWITCH_PLATFORM_ROOT=/absolute/path/to/upswitch`. If a developer installs an
app without the workspace, the command fails with an explicit setup message
instead of a vague missing-file error. When `UPSWITCH_PLATFORM_ROOT` is set, it
is treated as authoritative so a bad CI/workstation override fails loudly.
