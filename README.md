# Nest Thermostat Firmware Setup

> **⚠️ WARNING: EXPERIMENTAL SOFTWARE**
>
> This project is currently in the **experimental/testing phase**. Do NOT use this firmware on any thermostat that is critical for your heating or cooling needs. Flashing this firmware may brick your device or cause unexpected behavior. Only proceed if you have a backup thermostat or can afford to have your device non-functional during testing.

## Overview

This firmware loader uses the OMAP bootloader interface to flash custom bootloader and kernel images to Nest Thermostat devices. The device must be put into DFU mode to accept new firmware.

**Supported Devices:**
- Nest Learning Thermostat Gen 1 (Diamond) - Fully supported
- Nest Learning Thermostat Gen 2 (j49) - Fully supported

**Important:** After flashing this firmware, your device will no longer contact Nest/Google servers. It will operate independently and connect to the No Longer Evil platform instead, giving you complete control over your thermostat.

## How it Works

The custom firmware flashes the device with modified bootloader and kernel components that redirect all network traffic from the original Nest/Google servers to a server we specify. This server hosts a reverse-engineered replica of their API, allowing the thermostat to function independently while giving you complete control over your device data and settings.

By intercepting the communication layer, the thermostat believes it's communicating with the official Nest infrastructure, but instead connects to the No Longer Evil platform. This approach ensures full compatibility with the device's existing software while breaking free from Google's cloud dependency.

## Installation Options

Choose the installation method that best fits your needs:

### Hosted Install (Recommended for Most Users)

Use our cloud-hosted No Longer Evil platform - no server setup required!

**[📖 View Hosted Installation Guide](https://docs.nolongerevil.com/hosted/overview)**

### Self-Hosted Install (Advanced Users)

Run your own No Longer Evil server infrastructure for complete control and privacy.

**[📖 View Self-Hosted Installation Guide](https://docs.nolongerevil.com/self-hosted/overview)**

## Security Considerations

This tool provides low-level access to the device's boot process. Use responsibly:

- Only use on devices you own
- Improper firmware can brick your device (Don't sue me bro)

## Credits & Acknowledgments

This project builds upon the excellent work of several security researchers and developers:

- **[grant-h](https://github.com/grant-h) / [ajb142](https://github.com/ajb142)** - [omap_loader](https://github.com/ajb142/omap_loader), the USB bootloader tool used to flash OMAP devices
- **[exploiteers (GTVHacker)](https://github.com/exploiteers)** - Original research and development of the [Nest DFU attack](https://github.com/exploiteers/NestDFUAttack), which demonstrated the ability to flash custom firmware to Nest devices gen 1 & gen 2
- **[FULU](https://bounties.fulu.org/)** and all bounty backers - For funding the [Nest Learning Thermostat Gen 1/2 bounty](https://bounties.fulu.org/bounties/nest-learning-thermostat-gen-1-2) and supporting the right-to-repair movement
- **[z3ugma](https://sett.homes)** - MQTT/Home Assistant integration support

Without their groundbreaking research, open-source contributions, and advocacy for device ownership rights, this work would not be possible. Thank you!

## Open Source Commitment

We are committed to transparency and the right-to-repair movement. This project is now fully open source, allowing the community to audit, improve, and self-host their own infrastructure.

## Support

This project is sponsored by the team at:

<p align="center">
  <a href="https://hackhouse.io" target="_blank">
    <img src="assets/hh-logo.png" width="200" alt="Hack/House Logo" />
  </a>
</p>

## Stay in touch

- Author - [Cody Kociemba](https://www.linkedin.com/in/codykociemba/)
- Website - [https://nolongerevil.com](https://nolongerevil.com)
- Discord - [https://discord.gg/hackhouse](https://discord.com/invite/hackhouse)

## License

No Longer Evil is MIT licensed.
