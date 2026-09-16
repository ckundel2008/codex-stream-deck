# Third-party notices

## Upstream project

This project derives from Marcel Pociot's [codex-micro-stream-deck-emulator](https://github.com/mpociot/codex-micro-stream-deck-emulator), baseline commit `7093bd4`. Its MIT copyright and license are preserved verbatim in `LICENSE`. This repository contains locally developed additions and fixes; it is not an official upstream release.

## Dependencies

Dependencies are installed from npm and pinned by `package-lock.json`; their own license files remain in their packages. Major direct dependencies:

- `@elgato-stream-deck/node`: MIT; [node-elgato-stream-deck](https://github.com/Julusian/node-elgato-stream-deck).
- `sharp`: Apache-2.0; [sharp](https://github.com/lovell/sharp). Native components carry additional notices supplied by the package.
- `lucide-static`: ISC; [Lucide](https://github.com/lucide-icons/lucide). Some original Feather-derived icons additionally carry the MIT notice supplied by the package.

The layout preview uses this project's renderer, synthetic task names and Lucide glyphs. No proprietary OpenAI application code, authentication files or live task data is included.

OpenAI, Codex, Elgato, Stream Deck and Work Louder names identify compatible products. Their owners do not sponsor or endorse this community project.
