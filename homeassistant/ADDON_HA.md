---
title: "Add-on communication"
---

There are different ways of communicating between add-ons inside Home Assistant.

## Network

We use an internal network that's allowed to communicate with every add-on, including to/from Home Assistant, by using its name or alias. Only add-ons that run on the host network are limited in that they can talk with all internal add-ons by their name, but all other add-ons can't address these add-ons by name. However, using an alias works for both!

Names/aliases are used for communication inside Home Assistant.
The name is generated using the following format: `{REPO}_{SLUG}`, e.g., `local_xy` or `3283fh_myaddon`. In this example, `{SLUG}` is defined in an add-on's `config.yaml` file. You can use this name as the DNS name also, but you need to replace any `_` with `-` to have a valid hostname. If an add-on is installed locally, `{REPO}` will be `local`. If the add-on is installed from a Github repository, `{REPO}` is a hashed identifier generated from the GitHub repository's URL (ex: `https://github.com/xy/my_hassio_addons`). See [here](https://github.com/home-assistant/supervisor/blob/4ac7f7dcf08abb6ae5a018536e57d078ace046c8/supervisor/store/utils.py#L17) to understand how this identifier is generated. Note that this identifier is required in certain actions that use the [Supervisor add-on API][supervisor-addon-api]. You can view the repository identifiers for all currently installed add-ons via a GET request to the Supervisor API `addons` endpoint.

Use `supervisor` for communication with the internal API.

## Home Assistant Core

An add-on can talk to the [Home Assistant Core API][core-api] using the internal proxy. This makes it very easy to communicate with the API without knowing the password, port or any other information about the Home Assistant instance. Using this URL: `http://supervisor/core/api/` ensures that internal communication is redirected to the right place. The next step is to add `homeassistant_api: true` to the `config.yaml` file and read the environment variable `SUPERVISOR_TOKEN`. Use this as the Home Assistant Core [bearer token](/auth_api.md#making-authenticated-requests) when making requests.

For example `curl -X GET -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" -H "Content-Type: application/json" http://supervisor/core/api/config`

There is also a proxy for the [Home Assistant Websocket API][core-websocket] that works like the API proxy above and requires `SUPERVISOR_TOKEN` as the password. Use this URL: `ws://supervisor/core/websocket`.

It is also possible to talk directly to the Home Assistant instance, which is named `homeassistant`, over the internal network. However, you'll need to know the configuration that is used by the running instance.

We have several actions inside Home Assistant to run tasks. Send data over STDIN to an add-on to use the `hassio.addon_stdin` action.

## Supervisor API

To enable calls to the [Supervisor API][supervisor-api], add `hassio_api: true` to the `config.yaml` file and read the environment variable `SUPERVISOR_TOKEN`. Now you can use the API over the URL: `http://supervisor/`. Use the `SUPERVISOR_TOKEN` with header `Authorization: Bearer`. You may also need to change the Supervisor API role to `hassio_role: default`.

Add-ons can call some API commands without needing to set `hassio_api: true`:

- `/core/api`
- `/core/api/stream`
- `/core/websocket`
- `/addons/self/*`
- `/services*`
- `/discovery*`
- `/info`

***Note:*** For Home Assistant API access requirements, see above.

## Services API

We have an internal services API to make services public to other add-ons without the user needing to add any configuration. An add-on can get the full configuration for a service to use and to connect to it. The add-on needs to mark the usage of a service in the add-on [configuration](configuration.md) in order to be able to access a service. All supported services, including its available options, are documented in the [API documentation][supervisor-services-api].

Supported services are:

- mqtt
- mysql

You can use Bashio to get this information for your add-on init as: `bashio::services <service> <query>`

For example:

```bash
MQTT_HOST=$(bashio::services mqtt "host")
MQTT_USER=$(bashio::services mqtt "username")
MQTT_PASSWORD=$(bashio::services mqtt "password")
```

[core-api]: /api/rest.md
[core-websocket]: /api/websocket.md
[supervisor-api]: /api/supervisor/endpoints.md
[supervisor-addon-api]: /api/supervisor/endpoints.md#addons
[supervisor-services-api]: /api/supervisor/endpoints.md#service
---
title: "Add-on configuration"
---

Each add-on is stored in a folder. The file structure looks like this:

```text
addon_name/
  translations/
    en.yaml
  apparmor.txt
  build.yaml
  CHANGELOG.md
  config.yaml
  DOCS.md
  Dockerfile
  icon.png
  logo.png
  README.md
  run.sh
```

:::note
Translation files, `config` and `build` all support `.json`, `.yml` and `.yaml` as the file type.

To keep it simple all examples use `.yaml`
:::

## Add-on script

As with every Docker container, you will need a script to run when the container is started. A user might run many add-ons, so it is encouraged to try to stick to Bash scripts if you're doing simple things.

All our images also have [bashio][bashio] installed. It contains a set of commonly used operations and can be used to be included in add-ons to reduce code duplication across add-ons, therefore making it easier to develop and maintain add-ons.

When developing your script:

- `/data` is a volume for persistent storage.
- `/data/options.json` contains the user configuration. You can use Bashio to parse this data.

```shell
CONFIG_PATH=/data/options.json

TARGET="$(bashio::config 'target')"
```

So if your `options` contain

```json
{ "target": "beer" }
```

then there will be a variable `TARGET` containing `beer` in the environment of your bash file afterwards.

[bashio]: https://github.com/hassio-addons/bashio

## Add-on Dockerfile

All add-ons are based on the latest Alpine Linux image. Home Assistant will automatically substitute the right base image based on the machine architecture. Add `tzdata` if you need to run in a different timezone. `tzdata` Is is already added to our base images.

```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Install requirements for add-on
RUN \
  apk add --no-cache \
    example_alpine_package

# Copy data for add-on
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
```

If you don't use local build on the device or our build script, make sure that the Dockerfile also has a set of labels that include:

```dockerfile
LABEL \
  io.hass.version="VERSION" \
  io.hass.type="addon" \
  io.hass.arch="armhf|aarch64|i386|amd64"
```

It is possible to use your own base image with `build.yaml` or if you do not need support for automatic multi-arch building you can also use a simple docker `FROM`. You can also suffix the Dockerfile with the specific architecture to use a specific Dockerfile for a particular architecture, i.e. `Dockerfile.amd64`.

### Build args

We support the following build arguments by default:

| ARG | Description |
|-----|-------------|
| `BUILD_FROM` | Holds the image for dynamic builds or buildings over our systems.
| `BUILD_VERSION` | Add-on version (read from `config.yaml`).
| `BUILD_ARCH` | Holds the current build arch inside.

## Add-on configuration

The configuration for an add-on is stored in `config.yaml`.

```yaml
name: "Hello world"
version: "1.1.0"
slug: folder
description: >-
  "Long description"
arch:
  - amd64
url: "website with more information about the add-on (e.g., a forum thread for support)"
ports:
  123/tcp: 123
map:
  - type: share
    read_only: False
  - type: ssl
  - type: homeassistant_config
    read_only: False
    path: /custom/config/path
image: repo/{arch}-my-custom-addon
```

:::note
Avoid using `config.yaml` as filename in your add-on for anything other than the add-on configuration. The Supervisor does a recursively search for `config.yaml` in the add-on repository.
:::

### Required configuration options

| Key | Type | Description |
| --- | ---- | ----------- |
| `name` | string | The name of the add-on.
| `version` | string | Version of the add-on. If you are using a docker image with the `image` option, this needs to match the tag of the image that will be used.
| `slug` | string | Slug of the add-on. This needs to be unique in the scope of the [repository](/docs/add-ons/repository) that the add-on is published in and URI friendly.
| `description` | string | Description of the add-on.
| `arch` | list | A list of supported architectures: `armhf`, `armv7`, `aarch64`, `amd64`, `i386`.

### Optional configuration options

| Key | Type | Default | Description |
| --- | ---- | -------- | ----------- |
| `machine` | list | | Default is support of all machine types. You can configure the add-on to only run on specific machines. You can use `!` before a machine type to negate it.
| `url` | url | | Homepage of the add-on. Here you can explain the add-on and options.
| `startup` | string | `application` | `initialize` will start the add-on on setup of Home Assistant. `system` is for things like databases and not dependent on other things. `services` will start before Home Assistant, while `application` is started afterwards. Finally `once` is for applications that don't run as a daemon.
| `webui` | string | | A URL for the web interface of this add-on. Like `http://[HOST]:[PORT:2839]/dashboard`, the port needs the internal port, which will be replaced with the effective port. It is also possible to bind the protocol part to a configuration option with: `[PROTO:option_name]://[HOST]:[PORT:2839]/dashboard` and it's looked up if it is `true` and it's going to `https`.
| `boot` | string | `auto` | `auto` start at boot is controlled by the system and `manual` configures the add-on to only be started manually. If addon should never be started at boot automatically, use `manual_only` to prevent users from changing it.
| `ports` | dict | | Network ports to expose from the container. Format is `"container-port/type": host-port`. If the host port is `null` then the mapping is disabled.
| `ports_description` | dict | | Network ports description mapping. Format is `"container-port/type": "description of this port"`. Alternatively use [Port description translations](#port-description-translations).
| `host_network` | bool | `false` | If `true`, the add-on runs on the host network.
| `host_ipc` | bool | `false` | Allow the IPC namespace to be shared with others.
| `host_dbus` | bool | `false` | Map the host D-Bus service into the add-on.
| `host_pid` | bool | `false` | Allow the container to run on the host PID namespace. Works only for not protected add-ons. **Warning:** Does not work with S6 Overlay. If need this to be `true` and you use the normal add-on base image you disable S6 by overriding `/init`. Or use an alternate base image.
| `host_uts` | bool | `false` | Use the hosts UTS namespace.
| `devices` | list | | Device list to map into the add-on. Format is: `<path_on_host>`. E.g., `/dev/ttyAMA0`
| `homeassistant` | string | | Pin a minimum required Home Assistant Core version for the add-on. Value is a version string like `2022.10.5`.
| `hassio_role` | str | `default` |Role-based access to Supervisor API. Available: `default`, `homeassistant`, `backup`, `manager` or `admin`
| `hassio_api` | bool | `false` | This add-on can access the Supervisor's REST API. Use `http://supervisor`.
| `homeassistant_api` | bool | `false` | This add-on can access the Home Assistant REST API proxy. Use `http://supervisor/core/api`.
| `docker_api` | bool | `false` | Allow read-only access to the Docker API for the add-on. Works only for not protected add-ons.
| `privileged` | list | | Privilege for access to hardware/system. Available access: `BPF`, `CHECKPOINT_RESTORE`, `DAC_READ_SEARCH`, `IPC_LOCK`, `NET_ADMIN`, `NET_RAW`, `PERFMON`, `SYS_ADMIN`, `SYS_MODULE`, `SYS_NICE`, `SYS_PTRACE`, `SYS_RAWIO`, `SYS_RESOURCE` or `SYS_TIME`.
| `full_access` | bool | `false` | Give full access to hardware like the privileged mode in Docker. Works only for not protected add-ons. Consider using other add-on options instead of this, like `devices`. If you enable this option, don't add `devices`, `uart`, `usb` or `gpio` as this is not needed.
| `apparmor` | bool/string | `true` | Enable or disable AppArmor support. If it is enabled, you can also use custom profiles with the name of the profile.
| `map` | list | | List of Home Assistant directory types to bind mount into your container. Possible values: `homeassistant_config`, `addon_config`, `ssl`, `addons`, `backup`, `share`, `media`, `all_addon_configs`, and `data`. Defaults to read-only, which you can change by adding the property `read_only: false`. By default, all paths map to `/<type-name>` inside the addon container, but an optional `path` property can also be supplied to configure the path (Example: `path: /custom/config/path`). If used, the path must not be empty, unique from any other path defined for the addon, and not the root path. Note that the `data` directory is always mapped and writable, but the `path` property can be set using the same conventions.
| `environment` | dict | | A dictionary of environment variables to run the add-on with.
| `audio` | bool | `false` | Mark this add-on to use the internal audio system. We map a working PulseAudio setup into the container. If your application does not support PulseAudio, you may need to install: Alpine Linux `alsa-plugins-pulse` or Debian/Ubuntu `libasound2-plugins`.
| `video` | bool | `false` | Mark this add-on to use the internal video system. All available devices will be mapped into the add-on.
| `gpio` | bool | `false` | If this is set to `true`, `/sys/class/gpio` will map into the add-on for access to the GPIO interface from the kernel. Some libraries also need  `/dev/mem` and `SYS_RAWIO` for read/write access to this device. On systems with AppArmor enabled, you need to disable AppArmor or provide your own profile for the add-on, which is better for security.
| `usb` | bool | `false` | If this is set to `true`, it would map the raw USB access `/dev/bus/usb` into the add-on with plug&play support.
| `uart` | bool | `false` | Default `false`. Auto mapping all UART/serial devices from the host into the add-on.
| `udev` | bool | `false` | Default `false`. Setting this to `true` gets the host udev database read-only mounted into the add-on.
| `devicetree` | bool | `false` | If this is set to `true`, `/device-tree` will map into the add-on.
| `kernel_modules` | bool | `false` | Map host kernel modules and config into the add-on (readonly) and give you `SYS_MODULE` permission.
| `stdin` | bool | `false` | If enabled, you can use the STDIN with Home Assistant API.
| `legacy` | bool | `false` | If the Docker image has no `hass.io` labels, you can enable the legacy mode to use the config data.
| `options` | dict | | Default options value of the add-on.
| `schema` | dict | | Schema for options value of the add-on. It can be `false` to disable schema validation and options.
| `image` | string | | For use with Docker Hub and other container registries. This should be set to the name of the image only (E.g, `ghcr.io/home-assistant/{arch}-addon-example`). If you use this option, set the active docker tag using the `version` option.
| `codenotary` | string | | For use with Codenotary CAS. This is the E-Mail address used to verify your image with Codenotary (E.g, `example@home-assistant.io`). This should match the E-Mail address used as the signer in the [add-on's extended build options](#add-on-extended-build)
| `timeout` | integer | 10 | Default 10 (seconds). The timeout to wait until the Docker daemon is done or will be killed.
| `tmpfs` | bool | `false` | If this is set to `true`, the containers `/tmp` uses tmpfs, a memory file system.
| `discovery` | list | | A list of services that this add-on provides for Home Assistant.
| `services` | list | | A list of services that will be provided or consumed with this add-on. Format is `service`:`function` and functions are: `provide` (this add-on can provide this service), `want` (this add-on can use this service) or `need` (this add-on needs this service to work correctly).
| `auth_api` | bool | `false` | Allow access to Home Assistant user backend.
| `ingress` | bool | `false` | Enable the ingress feature for the add-on.
| `ingress_port` | integer | `8099` | For add-ons that run on the host network, you can use `0` and read the port later via the API.
| `ingress_entry` | string | `/` | Modify the URL entry point.
| `ingress_stream` | bool | `false` | When enabled, requests to the add-on are streamed
| `panel_icon` | string | `mdi:puzzle` | [MDI icon](https://materialdesignicons.com/) for the menu panel integration.
| `panel_title` | string | | Defaults to the add-on name, but can be modified with this option.
| `panel_admin` | bool | `true` | Make the menu entry only available to users in the admin group.
| `backup` | string | `hot` | `hot` or `cold`. If `cold`, the supervisor turns the add-on off before taking a backup (the `pre/post` options are ignored when `cold` is used).
| `backup_pre` | string | | Command to execute in the context of the add-on before the backup is taken.
| `backup_post` | string | | Command to execute in the context of the add-on after the backup was taken.
| `backup_exclude` | list | | List of files/paths (with glob support) that are excluded from backups.
| `advanced` | bool | `false` | Set this to `true` to require the user to have enabled "Advanced" mode for it to show.
| `stage` | string | `stable` | Flag add-on with follow attribute: `stable`, `experimental` or `deprecated`. Add-ons set to `experimental` or `deprecated` will not show up in the store unless the user enables advanced mode.
| `init` | bool | `true` | Set this to `false` to disable the Docker default system init. Use this if the image has its own init system (Like [s6-overlay](https://github.com/just-containers/s6-overlay)). *Note: Starting in V3 of S6 setting this to `false` is required or the addon won't start, see [here](https://developers.home-assistant.io/blog/2022/05/12/s6-overlay-base-images) for more information.*
| `watchdog` | string | | A URL for monitoring the add-on health. Like `http://[HOST]:[PORT:2839]/dashboard`, the port needs the internal port, which will be replaced with the effective port. It is also possible to bind the protocol part to a configuration option with: `[PROTO:option_name]://[HOST]:[PORT:2839]/dashboard` and it's looked up if it is `true` and it's going to `https`. For simple TCP port monitoring you can use `tcp://[HOST]:[PORT:80]`. It works for add-ons on the host or internal network.
| `realtime` | bool | `false` | Give add-on access to host schedule including `SYS_NICE` for change execution time/priority.
| `journald` | bool | `false` | If set to `true`, the host's system journal will be mapped read-only into the add-on. Most of the time the journal will be in `/var/log/journal` however on some hosts you will find it in `/run/log/journal`. Add-ons relying on this capability should check if the directory `/var/log/journal` is populated and fallback on `/run/log/journal` if not.
| `breaking_versions` | list | | List of breaking versions of the addon. A manual update will always be required if the update is to a breaking version or would cross a breaking version, even if users have auto-update enabled for the addon.
| `ulimits` | dict | | Dictionary of resource limit (ulimit) settings for the add-on container. Each limit can be either a plain integer value or a dictionary with the keys `soft` and `hard`, each taking a plain integer for fine-grained control. Individual values must not be larger than the host's hard limit (inspectable by `ulimit -Ha`; e.g. 524288 in case of the `nofile` limit in the Home Assistant Operating System). |

### Options / Schema

The `options` dictionary contains all available options and their default value. Set the default value to `null` or define the data type in the `schema` dictionary to make an option mandatory. This way the option needs to be given by the user before the add-on can start. Nested arrays and dictionaries are supported with a maximum depth of two.

To make an option truly optional (without default value), the `schema` dictionary needs to be used. Put a `?` at the end of the data type and *do not* define any default value in the `options` dictionary. If any default value is given, the option becomes a required value.

```yaml
message: "custom things"
logins:
  - username: beer
    password: "123456"
  - username: cheep
    password: "654321"
random:
  - haha
  - hihi
link: "http://example.com/"
size: 15
count: 1.2
```

:::note
If you remove a configuration option from an add-on already deployed to users, it is recommended to delete the option to avoid a warning like `Option '<options_key>' does not exist in the schema for <Add-on Name> (<add-on slug>)`.

To remove an option the Supervisor addons API can be used. Using bashio this boils down to `bashio::addon.option '<options_key>'` (without additional argument to delete this option key). Typically this should be called inside an if block checking if the option is still set using `bashio::config.exists '<options_key>'`.
:::


The `schema` looks like `options` but describes how we should validate the user input. For example:

```yaml
message: str
logins:
  - username: str
    password: str
random:
  - "match(^\\w*$)"
ssh:
  private_key: str
  public_key: str
link: url
size: "int(5,20)"
count: float
not_need: "str?"
```

We support:

- `str` / `str(min,)` / `str(,max)` / `str(min,max)`
- `bool`
- `int` / `int(min,)` / `int(,max)` / `int(min,max)`
- `float` / `float(min,)` / `float(,max)` / `float(min,max)`
- `email`
- `url`
- `password`
- `port`
- `match(REGEX)`
- `list(val1|val2|...)`
- `device` / `device(filter)`: Device filter can be in the following format: `subsystem=TYPE` i.e. `subsystem=tty` for serial devices.

## Add-on extended build

Additional build options for an add-on are stored in `build.yaml`. This file will be read from our build systems.
This is only needed if you are not using the default images or need additional things.

```yaml
build_from:
  armhf: mycustom/base-image:latest
args:
  my_build_arg: xy
```

| Key | Required | Description |
| --- | -------- | ----------- |
| build_from | no | A dictionary with the hardware architecture as the key and the base Docker image as the value.
| args | no | Allow additional Docker build arguments as a dictionary.
| labels | no | Allow additional Docker labels as a dictionary.
| codenotary | no | Enable container signature with codenotary CAS.
| codenotary.signer | no | Owner signer E-Mail address for this image.
| codenotary.base_image | no | Verify the base container image. If you use our official images, use `notary@home-assistant.io`

We provide a set of [base images][docker-base] which should cover a lot of needs. If you don't want to use the Alpine based version or need a specific image tag, feel free to pin this requirement for your build with the `build_from` option.

[docker-base]: https://github.com/home-assistant/docker-base

## Add-on translations

Add-ons can provide translation files for configuration options that are used in the UI.

Example path to translation file: `addon/translations/{language_code}.yaml`

For `{language_code}` use a valid language code, like `en`, for a [full list have a look here](https://github.com/home-assistant/frontend/blob/dev/src/translations/translationMetadata.json), `en.yaml` would be a valid filename.

This file supports 2 main keys `configuration` and `network`.

### Configuration translations

```yaml
configuration:
  ssl:
    name: Enable SSL
    description: Enable usage of SSL on the webserver inside the add-on
  ssh:
    name: SSH Options
    description: Configure SSH authentication options
    fields:
      public_key:
        name: Public Key
        description: Client Public Key
      private_key:
        name: Private Key
        description: Client Private Key
```

_The key under `configuration` (`ssl`) in this case, needs to match a key in your `schema` configuration (in [`config.yaml`](#add-on-configuration))._

### Port description translations

```yaml
network:
  80/TCP: The webserver port (Not used for Ingress)
```

_The key under `network` (`80/TCP`) in this case, needs to match a key in your `ports` configuration (in [`config.yaml`](#add-on-configuration))._

## Add-on advanced options

Sometimes add-on developers may want to allow users to configure to provide their own files which are then provided directly to an internal service as part of its configuration. Some examples include:

1. Internal service wants a list of configured items and the schema of each item is complex but the service provides no UI for doing so, easier to point users to their documentation and ask for a file in that schema.
2. Internal service requires a binary file or some file configured externally as part of its config.
3. Internal service supports live reloading on config change and you want to support that for some or all of its configuration by asking users for a file in its schema to live reload from.

In cases like these you should add `addon_config` to `map` in your addon's configuration file. And then you should direct your users to put this file in the folder `/addon_configs/{REPO}_<your addon's slug>`. If an add-on is installed locally, `{REPO}` will be `local`. If the add-on is installed from a Github repository, `{REPO}` is a hashed identifier generated from the GitHub repository's URL (ex: `https://github.com/xy/my_hassio_addons`).
This folder will be mounted at `/config` inside your addon's docker container at runtime. You should either provide an option in your addon's schema that collects a relative path to the file(s) starting from this folder or rely on a fixed filename and include that in your documentation.

Another use case of `addon_config` could be if your addon wants to provide file-based output or give users access to internal files for debugging. Some examples include:

1. Internal service logs to a file and you wish to allow users access to that log file
2. Internal service uses a database and you wish to allow users access to that database for debugging
3. Internal service generates files which are intended to be used in its own config and you wish to allow users to access them as well

In cases like these you should add `addon_config:rw` to `map` so your addon can write to this folder as well as read from it. And then you should write these files out to `/config` during your addon's runtime so users can see and access them.
---
title: "Presenting your addon"
---

If you choose to make your add-on available to the public, providing clear information, graphics and security reassurances will help attract users.  The recommendations below are a guideline for presenting your add-on.

## Adding intro

This shows in the add-on store and gives the user a short description of what the add-on can do.

This file containing the intro is usually referred to as the "README", which is generally published as the `README.md` file.

## Adding documentation

Good documentation helps the consumer of your add-on to understand its usage, explains configuration options, points users in the right direction in the case they have questions or issues, and contains the license under which the add-on was published.

This file containing the documentation is usually referred to as the "DOCS", which is generally published as the `DOCS.md` file.

## Add-on icon & logo

A picture is worth a thousand words. Therefore, your add-on can be improved by adding a proper image icon and logo. These images are used when showing your add-on in the Home Assistant Supervisor panel and will significantly improve the visual representation of your add-on.

Requirements for the logo of your add-on:

- The logo must be in the Portable Network Graphics format (`.png`).
- The filename must be `logo.png`.
- It is recommended to keep the logo size around 250x100px. You may choose to use a different size or aspect ratio as you see fit for your add-on.

Requirements for the icon of your add-on:

- The icon must be in the Portable Network Graphics format (`.png`).
- The filename must be `icon.png`.
- The aspect ratio of the icon must be 1x1 (square).
- It is recommended to use an icon size of 128x128px.

## Keeping a changelog

It is likely you are going to release newer versions of your add-on in the future. In case that happens, the users of your add-on will see an upgrade notice and probably want to know what changes were made in the latest version.

A changelog is a file which contains a curated, chronologically ordered list of notable changes for each version of your add-on and is generally published as the `CHANGELOG.md` file.

For guidance on keeping a changelog, we recommend the [keep a changelog](http://keepachangelog.com) website. They have developed a standard used by many open source projects around the world.

## Offering stable and canary version

You may consider to offer a stable and a "next" or "canary" branch. These can be provided using different branches. When adding the add-on in Home Assistant, the user can select the wanted branch from a given repository by appending its name following a hashtag.

```text
https://github.com/home-assistant/hassio-addons-example#next
```

You should add this information to your documentation. Also, you should consider having different [names for the repositories](/docs/add-ons/repository#repository-configuration) in every branch, for example, "Super add-on (stable)" and "Super add-on (beta)".

## AppArmor

In the event that an API call returns something you, as a developer were not expecting, access to too many resources could be a liability for your users. As an add-on developer, it is your responsibility to ensure your add-on will not ruin your user's machine, or perform actions that you would never expect. That's where AppArmor comes in.

While your talents in input validation, handling sensitive data and other defensive programming tactics are not being judged here, AppArmor is your add-on's second line of defense against malicious API calls, malformed settings or other forms of system hijacking.

By default, AppArmor gives you a certain level of security by restricting some general actions that are deemed inappropriate for a Docker container. You can read more about Docker's AppArmor implementation on the [Docker Security page](https://docs.docker.com/engine/security/apparmor/).

As for Home Assistant's implementation, you can activate your own custom AppArmor profile by putting an `apparmor.txt` file into your add-on folder. Adding your own `apparmor.txt` will load that file as the primary AppArmor profile instead of the default implementation. On top of knowing your add-on will run in a constrained and effective manner, writing your own custom `apparmor.txt` file will earn your add-on a security point after your add-on is installed, thus improving your user's confidence and perception of your add-on.

An `apparmor.txt` goes in the same folder as your `config.yaml` file. Below is an example `apparmor.txt`. Replace `ADDON_SLUG` with the slug defined in your add-on configuration.

apparmor.txt

```txt
#include <tunables/global>

profile ADDON_SLUG flags=(attach_disconnected,mediate_deleted) {
  #include <abstractions/base>

  # Capabilities
  file,
  signal (send) set=(kill,term,int,hup,cont),

  # S6-Overlay
  /init ix,
  /bin/** ix,
  /usr/bin/** ix,
  /run/{s6,s6-rc*,service}/** ix,
  /package/** ix,
  /command/** ix,
  /etc/services.d/** rwix,
  /etc/cont-init.d/** rwix,
  /etc/cont-finish.d/** rwix,
  /run/{,**} rwk,
  /dev/tty rw,

  # Bashio
  /usr/lib/bashio/** ix,
  /tmp/** rwk,

  # Access to options.json and other files within your addon
  /data/** rw,

  # Start new profile for service
  /usr/bin/myprogram cx -> myprogram,

  profile myprogram flags=(attach_disconnected,mediate_deleted) {
    #include <abstractions/base>

    # Receive signals from S6-Overlay
    signal (receive) peer=*_ADDON_SLUG,

    # Access to options.json and other files within your addon
    /data/** rw,

    # Access to mapped volumes specified in config.json
    /share/** rw,

    # Access required for service functionality
    /usr/bin/myprogram r,
    /bin/bash rix,
    /bin/echo ix,
    /etc/passwd r,
    /dev/tty rw,
  }
}
```

When working on this for your own add-ons, the following tips should help you get started:

1. The S6 part of this is fairly standard. You may need to add things to accommodate your setup scripts but generally don't remove anything.
2. If a service being run provides an AppArmor profile, apply that to the service. Always prefer one written by the developers.
3. If there isn't one for a service and you want to make one then do the following:
  a. Add minimum required access you're aware of. Things you definitely know the service needs
  b. Add `complain` as a flag to the profile
  c. Run the add-on and review the audit log with `journalctl _TRANSPORT="audit" -g 'apparmor="ALLOWED"'`
  d. Add access as necessary until using the add-on does not generate any audit warnings
  e. Remove the `complain` flag so ungranted access is DENIED not ALLOWED
4. Repeat #3 when updating the service as new access may be required

## Ingress

Ingress allows users to access the add-on web interface via the Home Assistant UI. Authentication is handled by Home Assistant, so neither the user nor the add-on developer will need to care about the security or port forwarding. Users love this feature! It connects your user directly to the add-on, can provide a seamless UX within Home Assistant and grants your add-on 2 points of security.

Here are the requirements of Ingress:
- Ingress must be enabled. Set `ingress: true` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options).
- Your server may run on port 8099. If it does not run on 8099, you must set `ingress_port: PORT_NUMBER` in [`config.yaml`](/docs/add-ons/configuration/#add-on-config) to match your configuration.
- Only connections from `172.30.32.2` must be allowed. You should deny access to all other IP addresses within your add-on server. 
- Users are previously authenticated via Home Assistant. Authentication is not required. 

:::tip
Configuration of path and port information may be queried via [add-ons info API endpoint](/docs/api/supervisor/endpoints/#addons). If the Home Assistant URL is required by your addon, Ingress adds a request header `X-Ingress-Path` which may be filtered to obtain the base URL. 
:::

Ingress API gateway supports the following:

- HTTP/1.x
- Streaming content
- Websockets

## Basic ingress example with Nginx

The following is a basic ingress implementation with an Nginx server. This contains an example`Dockerfile`, `config.yaml`, and `ingress.conf` configuration.

The `ingress.conf` is configured to accept only connections from IP address `172.30.32.2` as we are only expecting connections from this IP address for Ingress purposes. Any other IP address will be rejected. The ingress port 8099 is utilized to reduce configuration work. If you wish to configure a different ingress port you may, but the `config.yaml` option `ingress_port` must be defined to match.

ingress.conf

```nginx
server {
    listen 8099;
    allow  172.30.32.2;
    deny   all;
}
```

Our example `Dockerfile` is configured to support only our Nginx server and does not support a `run.sh` like most add-ons. You may replace the `CMD` with your own command to allow more configuration options while launching your add-on. This Dockerfile will `RUN` to install our Nginx dependencies, `COPY` our example `ingress.conf` from above to the add-on container, then `CMD` start Nginx.

Dockerfile

```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

#Add nginx and create the run folder for nginx.
RUN \
  apk --no-cache add \
    nginx \
  \
  && mkdir -p /run/nginx

#Copy our conf into the nginx http.d folder.
COPY ingress.conf /etc/nginx/http.d/

#Launch nginx with debug options.
CMD [ "nginx","-g","daemon off;error_log /dev/stdout debug;" ]
```

In order to enable Ingress, our `config.yaml` file _must_ include `ingress: true` and _may_ specify the `ingress_port`, along with other required information.

config.yaml

```yaml
name: "Ingress Example"
version: "1.0.0"
slug: "nginx-ingress-example"
description: "Ingress testing"
arch:
  - amd64
  - armhf
  - armv7
  - i386
ingress: true
```

After the add-on is started, you should be able to view your Ingress server by clicking "OPEN WEB UI" within the add-on info screen.

## Security

Add-on security should be a matter of pride. You should strive for the highest level of security you can possibly attain. If your add-on has a lower security rating, then users will be less likely to trust it.

Each add-on starts with a base rating of 5, on a scale of 1 to 6. Depending on decisions made during development, you will be assigned a score based on certain actions. There are some actions that have additional consequences. These additional consequences appear in the Notes section of the following table.

| Action | Change | Notes |
|---|---|---|
| Use `ingress: true` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options) | +2 | overrides `auth_api` rating |
| Use `auth_api: true` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options) | +1 | overridden by `ingress` |
| Add-on is signed with [CodeNotary](https://cas.codenotary.com/)| +1||
| Use custom [`apparmor.txt`](/docs/add-ons/presentation#apparmor)| +1| Rating applied after installation |
| Set `apparmor: false` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options) | -1 | |
| Use `privileged: NET_ADMIN`, `SYS_ADMIN`, `SYS_RAWIO`, `SYS_PTRACE`, `SYS_MODULE`, or `DAC_READ_SEARCH`, or `kernel_modules: ` used in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options)| -1 | Rating applied only once if multiple are used. |
| Use `hassio_role: manager` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options) | -1 | |
| Use `host_network: true` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options) | -1 | |
| Use `hassio_role: admin` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options) | -2 | |
| Use `host_pid: true` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options) | -2 | |
| Use `host_uts: true` and `privileged: SYS_ADMIN` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options) | -1 | |
| Use `full_access: true` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options) | Security set to 1 | Overrides all other adjustments |
| Use `docker_api: true` in [`config.yaml`](/docs/add-ons/configuration#optional-configuration-options) | Security set to 1 | Overrides all other adjustments |
---
title: "Publishing your add-on"
---

There are two different ways of publishing add-ons. One is to publish pre-built containers to a container registry and the other option is to have users build the containers locally on their Home Assistant instance.

#### Pre-built containers

With pre-built containers, the developer is responsible for building the images for each architecture on their machine and pushing the results out to a container registry. This has a lot of advantages for the user who will only have to download the final container and be up and running once the download finishes. This makes the installation process fast and has almost no chance of failure so it is the preferred method.

We have automated the process of building and publishing add-ons. See below for the instructions.

#### Locally build containers

With the Supervisor, it is possible to distribute add-ons that will be built on the users machine. The advantage is that as a developer it is easy to test an idea and see if people are interested in your add-ons. This method includes installing and potentially compiling code. This means that installing such an add-on is slow and adds more wear and tear to users SD card/hard drive than the above mentioned pre-built solution. It also has a higher chance of failure if one of the dependencies of the container has changed or is no longer available.

Use this option when you are playing with add-ons and seeing if someone is interested in your work. Once you're an established repository, please migrate to pushing builds to a container registry as it greatly improves the user experience. In the future we will mark locally built add-ons in the add-on store to warn users.

## Build scripts to publish add-ons to a container registry

All add-ons are containers. Inside your add-on `config.yaml` you specify the container image that will be installed for your add-on:

```yaml
...
image: "myhub/image-{arch}-addon-name"
...
```

You can use `{arch}` inside the image name to support multiple architectures with one (1) configuration file. It will be replaced with the architecture of the user when we load the image. If you use `Buildargs` you can use the `build.yaml` to overwrite our default args.

Home Assistant assumes that the default branch of your add-on repository matches the latest tag on the container registry. When you're building a new version, it's suggested that you use another branch, ie `build` or do it with a PR on GitHub. After you push the add-on to a container registry, you can merge this branch to master.

## Custom add-ons

You need a Docker Hub account to make your own add-ons. You can build your container images with the Docker `build` command or use our [builder] to simplify the process. Pull our [Builder Docker engine][builder] and run one of the following commands.

For a git repository:

```shell
docker run \
  --rm \
  --privileged \
  -v ~/.docker/config.json:/root/.docker/config.json:ro \
  ghcr.io/home-assistant/amd64-builder \
  --all \
  -t addon-folder \
  -r https://github.com/xy/addons \
  -b branchname
```

For a local repository:

```shell
docker run \
  --rm \
  --privileged \
  -v ~/.docker/config.json:/root/.docker/config.json:ro \
  -v /my_addon:/data \
  ghcr.io/home-assistant/amd64-builder \
  --all \
  -t /data
```

:::tip
If you are developing on macOS and using Docker for Mac, you may encounter an error message similar to the following: `error creating aufs mount to /var/lib/docker/aufs/mnt/<SOME_ID>-init: invalid argument`. A proposed workaround is to add the following to the Advanced Daemon JSON configuration via Docker > Preferences > Daemon > Advanced: `"storage-driver" : "aufs"` or map the docker socket into container.
:::

[builder]: https://github.com/home-assistant/builder
---
title: "Create an add-on repository"
---

An add-on repository can contain one or more add-ons. Each add-on is stored in its own unique folder. To be identified as a repository, the repository must contain a configuration file.

Check the [Example add-on repository](https://github.com/home-assistant/addons-example) for further details.

## Installing a repository

A user can add a repository by going to the Supervisor panel in Home Assistant, clicking on the store icon in the top right, copy/paste the URL of your repository into the repository textarea and click on **Save**.

:::tip
You can generate a [my.home-assistant.io](https://my.home-assistant.io/create-link/) for your users to do this with the click of a button in your readme file.
:::

## Repository configuration

Each repository is required to contain `repository.yaml` at the root in the git repository.

```yaml
name: Name of repository
url: http://www.example/addons
maintainer: HomeAssistant Team <info@home-assistant.io>
```

| Key | Required | Description |
| --- | -------- | ----------- |
| `name` | yes | Name of the repository
| `url` | no | Homepage of the repository. Here you can explain the various add-ons.
| `maintainer` | no | Contact info of the maintainer.
---
title: "Add-on security"
---

Home Assistant rates every add-on based on the wanted rights. An add-on with a rating of 6 is very secure. If an add-on has a rating of 1, you shouldn't run this add-on unless you are 100% sure that you can trust the source.

## API role

For access to the Supervisor API you need to define a role or run in default mode. This is only required for the Supervisor API and not the Home Assistant proxy. All of the roles already have access to the default API calls, and do not require any additional settings.

### Available roles

| Role | Description |
|------|-------------|
| `default` | Have access to all `info` calls |
| `homeassistant` | Can access all Home Assistant API endpoints |
| `backup` | Can access all backup API endpoints |
| `manager` | Is for Add-ons that run CLIs and need extended rights |
| `admin` | Have access to every API call. That is the only one they can disable/enable the Add-on protection mode |

## Codenotary CAS

You can sign your images and also verify our base image which you build from to provide a full chain of trust. This feature is supported by our [Builder](https://github.com/home-assistant/builder) and the [build config](/docs/add-ons/configuration#add-on-extended-build). To enable this feature on the Supervisor for your add-on, you simply need to add your email address to the add-on configuration `codenotary`.

## Protection

Default, all add-ons run in protection enabled mode. This mode prevents the add-on from getting any rights on the system. If an add-on requires more rights, you can disable this protection via the API add-on options for that add-on. But be careful, an add-on with disabled protection can destroy your system!

## Making a secure add-on

As a developer, follow the following best practices to make your add-on secure:

- Don't run on host network
- Create an AppArmor profile
- Map folders read only if you don't need write access
- If you need any API access, make sure that you do not grant permission that aren't needed
- Sign the image with [Codenotary CAS](https://cas.codenotary.com/)

## Use Home Assistant user backend

Instead of allowing users to set new login credentials in plain text config, use the Home Assistant [Auth backend](/docs/api/supervisor/endpoints#auth). You can enable the access to the API with `auth_api: true`. Now you are able to send the login credentials to the auth backend and validate them in Home Assistant.

## Authenticating a user when using ingress

When the addon is accessed via the supervisor's ingress, the authorized user can be identified by its session token. The supervisor then adds some headers identifying the user to every request:

| Header name                | Description                                 |
| -------------------------- | ------------------------------------------- |
| X-Remote-User-Id           | ID of the authenticated Home Assistant user |
| X-Remote-User-Name         | The username of the authenticated user      |
| X-Remote-User-Display-Name | The display name of the authenticated user  |
---
title: "Local add-on testing"
---

The fastest and recommended way to develop add-ons is using a local Visual Studio Code devcontainer. We maintain a [devcontainer for this purpose](https://github.com/home-assistant/devcontainer) which is used in all our add-on repositories. This devcontainer setup for VS Code runs Supervisor and Home Assistant, with all of the add-ons mapped as local add-ons inside, making it simple for add-on developers on Windows, Mac and Linux desktop OS-es.

- Follow the instructions to download and install the [Remote Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) VS Code extension.
- Copy the [`devcontainer.json`](https://github.com/home-assistant/devcontainer/raw/main/addons/devcontainer.json) file to `.devcontainer/devcontainer.json` in your repository.
- Copy the [`tasks.json`](https://github.com/home-assistant/devcontainer/raw/main/addons/tasks.json) file to `.vscode/tasks.json` in your repository.
- Open the root folder inside VS Code, and when prompted re-open the window inside the container (or, from the Command Palette, select 'Rebuild and Reopen in Container').
- When VS Code has opened your folder in the container (which can take some time for the first run) you'll need to run the task (Terminal -> Run Task) 'Start Home Assistant', which will bootstrap Supervisor and Home Assistant.
- You'll then be able to access the normal onboarding process via the Home Assistant instance at `http://localhost:7123/`.
- The add-on(s) found in your root folder will automatically be found in the Local Add-ons repository.

## Remote development

If you require access to physical hardware or other resources that cannot be locally emulated (for example, serial ports), the next best option to develop add-ons is by adding them to the local add-on repository on a real device running Home Assistant. To access the local add-on repository on a remote device, install either the [Samba](https://my.home-assistant.io/redirect/supervisor_addon/?addon=core_samba) or the [SSH](https://my.home-assistant.io/redirect/supervisor_addon/?addon=core_ssh) add-ons and copy the add-on files to a subdirectory of `/addons`.

Right now add-ons will work with images that are stored on Docker Hub (using `image` from add-on config). To ensure that the add-on is built locally and not fetched from an upstream repository, ensure that the `image` key is commented out in your `config.yaml` file (You can do that by adding a `#` in front of it, like `#image: xxx`).

## Local build

If you don't want to use the devcontainer environment, you can still build add-ons locally with Docker. The recommended method is to use the [official build tool][hassio-builder] to create the Docker images.

Assuming that your addon is in the folder `/path/to/addon` and your Docker socket is at `/var/run/docker.sock`, you can build the addon for all supported architectures by running the following:

```shell
docker run \
  --rm \
  -it \
  --name builder \
  --privileged \
  -v /path/to/addon:/data \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  ghcr.io/home-assistant/amd64-builder \
  -t /data \
  --all \
  --test \
  -i my-test-addon-{arch} \
  -d local
```

If you don't want to use the official build tool, you can still build with standalone Docker. If you use `FROM $BUILD_FROM` you'll need to set a base image with build args. Normally you can use following base images:

- armhf: `ghcr.io/home-assistant/armhf-base:latest`
- aarch64: `ghcr.io/home-assistant/aarch64-base:latest`
- amd64: `ghcr.io/home-assistant/amd64-base:latest`
- i386: `ghcr.io/home-assistant/i386-base:latest`

Use `docker` from the directory containing the add-on files to build the test addon:

```shell
docker build \
  --build-arg BUILD_FROM="ghcr.io/home-assistant/amd64-base:latest" \
  -t local/my-test-addon \
  .
```

[hassio-builder]: https://github.com/home-assistant/builder

## Local run

If you don't want to use the devcontainer environment, you can still run add-ons locally with Docker.

For that you can use the following command:

```shell
docker run \
  --rm \
  -v /tmp/my_test_data:/data \
  -p PORT_STUFF_IF_NEEDED \
  local/my-test-addon
```

## Logs

All `stdout` and `stderr` outputs are redirected to the Docker logs. The logs can be fetched from the add-on page inside the Supervisor panel in Home Assistant.
---
title: "Tutorial: Making your first add-on"
---

So you've got Home Assistant going and you've been enjoying the built-in add-ons but you're missing this one application. Time to make your own add-on!

To get started with developing add-ons, we first need access to where Home Assistant looks for local add-ons. For this you can use the [Samba](https://my.home-assistant.io/redirect/supervisor_addon/?addon=core_samba) or the [SSH](https://my.home-assistant.io/redirect/supervisor_addon/?addon=core_ssh) add-ons.

For Samba, once you have enabled and started it, your Home Assistant instance will show up in your local network tab and share a folder called "addons". This is the folder to store your custom add-ons.

:::tip
If you are on macOS and the folder is not showing up automatically, go to Finder and press CMD+K then enter `smb://homeassistant.local`
:::

For SSH, you will have to install it. Before you can start it, you will have to have a private/public key pair and store your public key in the add-on config ([see docs for more info](https://github.com/home-assistant/addons/blob/master/ssh/DOCS.md#configuration)). Once started, you can SSH to Home Assistant and store your custom add-ons in the `/addons` directory.

Once you have located your add-on directory, it's time to get started!

## Step 1: The basics

- Create a new directory called `hello_world`
- Inside that directory create three files:
  - `Dockerfile`
  - `config.yaml`
  - `run.sh`

### The `Dockerfile` file

This is the image that will be used to build your add-on.

```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Copy data for add-on
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
```

### The `config.yaml` file

This is your add-on configuration, which tells the Supervisor what to do and how to present your add-on.

For an overview of all valid add-on configuration options have a look [here](/docs/add-ons/configuration#add-on-configuration)

```yaml
name: "Hello world"
description: "My first real add-on!"
version: "1.0.0"
slug: "hello_world"
init: false
arch:
  - aarch64
  - amd64
  - armhf
  - armv7
  - i386
```

### The `run.sh` file

This is the script that will run when your add-on starts.

```shell
#!/usr/bin/with-contenv bashio

echo "Hello world!"
```

:::note
Make sure your editor is using UNIX-like line breaks (LF), not DOS/Windows (CRLF).
:::

## Step 2: Installing and testing your add-on

Now comes the fun part, time to open the Home Assistant UI and install and run your add-on.

- Open the Home Assistant frontend
- Go to "Settings"
- Click on "Add-ons"
- Click "Add-on store" in the bottom right corner.

[![Open your Home Assistant instance and show the Supervisor add-on store.](https://my.home-assistant.io/badges/supervisor_store.svg)](https://my.home-assistant.io/redirect/supervisor_store/)

- On the top right overflow menu, click the "Check for updates" button
- Refresh your webpage when needed
- You should now see a new section at the top of the store called "Local add-ons" that lists your add-on!

![Screenshot of the local repository card](/img/en/hass.io/screenshots/local_repository.png)

- Click on your add-on to go to the add-on details page.
- Install your add-on
- Start your add-on
- Click on the "Logs" tab, and refresh the logs of your add-on, you should now see "Hello world!" in your logs.

![Screenshot of the add-on logs](/img/en/hass.io/tutorial/addon_hello_world_logs.png)

### I don't see my add-on?!

Oops! You clicked "Check for updates" in the store and your add-on didn't show up. Or maybe you just updated an option, clicked refresh and saw your add-on disappear.

When this happens, try refreshing your browser's cache first by pressing <kbd>Ctrl</kbd> + <kbd>F5</kbd> (Windows/Linux) or <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> (macOS). If that didn't help, it means that your `config.yaml` is invalid. It's either [invalid YAML](http://www.yamllint.com/) or one of the specified options is incorrect. To see what went wrong, go to ["Settings" → "System" → "Logs" and select "Supervisor" in the top-right drop-down menu](https://my.home-assistant.io/redirect/logs/?provider=supervisor). This should bring you to a page with the logs of the supervisor. Scroll to the bottom and you should be able to find the validation error.

Once you fixed the error, go to the add-on store and click "Check for updates" again.

## Step 3: Hosting a server

Until now we've been able to do some basic stuff, but it's not very useful yet. So let's take it one step further and host a server that we expose on a port. For this we're going to use the built-in HTTP server that comes with Python 3.

To do this, we will need to update our files as follows:

- `Dockerfile`: Install Python 3
- `config.yaml`: Make the port from the container available on the host
- `run.sh`: Run the Python 3 command to start the HTTP server

Update your `Dockerfile`:

```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Install requirements for add-on
RUN \
  apk add --no-cache \
    python3

# Python 3 HTTP Server serves the current working dir
# So let's set it to our add-on persistent data directory.
WORKDIR /data

# Copy data for add-on
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
```

Add "ports" to `config.yaml`. This will make TCP on port 8000 inside the container available on the host on port 8000.

```yaml
name: "Hello world"
description: "My first real add-on!"
version: "1.1.0"
slug: "hello_world"
init: false
arch:
  - aarch64
  - amd64
  - armhf
  - armv7
  - i386
startup: services
ports:
  8000/tcp: 8000
```

Update `run.sh` to start the Python 3 server:

```shell
#!/usr/bin/with-contenv bashio

echo "Hello world!"

python3 -m http.server 8000
```

## Step 4: Installing the update

Since we updated the version number in our `config.yaml`, Home Assistant will show an update button when looking at the add-on details. You might have to refresh your browser or click the "Check for updates" button in the add-on store for it to show up. If you did not update the version number, you can also uninstall and install the add-on again. After installing the add-on again, make sure you start it.

Now navigate to [http://homeassistant.local:8000](http://homeassistant.local:8000) to see our server in action!

![Screenshot of the file index served by the add-on](/img/en/hass.io/tutorial/python3-http-server.png)

## Bonus: Working with add-on options

In the screenshot, you've probably seen that our server only served up 1 file: `options.json`. This file contains the user configuration for this add-on. Because we specified two empty objects for the `options` and `schema` keys in our `config.yaml`, the resulting file is currently empty.

Let's see if we can get some data into that file!

To do this, we need to specify the default options and a schema for the user to change the options. Change the options and schema entries in your `config.yaml` with the following:

```yaml
...
options:
  beer: true
  wine: true
  liquor: false
  name: "world"
  year: 2017
schema:
  beer: bool
  wine: bool
  liquor: bool
  name: str
  year: int
...
```

Reload the add-on store and re-install your add-on. You will now see the options available in the add-on config screen. When you now go back to our Python 3 server and download `options.json`, you'll see the options you set. [Example of how options.json can be used inside `run.sh`](https://github.com/home-assistant/addons/blob/master/dhcp_server/data/run.sh#L10-L13)

## Bonus: Template add-on repository

We maintain a full template example repository for add-ons you can use to get started. You can find that in the [`home-assistant/addons-example` repository](https://github.com/home-assistant/addons-example).
