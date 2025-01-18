# Motoswap Native Swap

![Bitcoin](https://img.shields.io/badge/Bitcoin-000?style=for-the-badge&logo=bitcoin&logoColor=white)
![AssemblyScript](https://img.shields.io/badge/assembly%20script-%23000000.svg?style=for-the-badge&logo=assemblyscript&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node%20js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)
![NPM](https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white)

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Motoswap's **Native Swap** contract allows users to perform efficient, on chain swaps leveraging web technologies such
as AssemblyScript and WebAssembly.

For **detailed documentation** on how the Native Swap works such as mechanics, math, and security please
see [NativeSwap.md](docs/NativeSwap.md).

## Overview

- **Native BTC Support**: Includes specialized logic to handle the irreversibility of transactions.
- **Cross-Chain Efficiency**: Utilizes an internal AMM approach combined with reservation models to prevent partial
  failures that can't be reverted on the blockchain side.
- **Scalable Architecture**: Designed to handle high throughput while maintaining consistent, block-based price updates.

## Prerequisites

- [Node.js](https://nodejs.org/en/download/prebuilt-installer) >= 21.0
- [npm](https://www.npmjs.com/) >= 10.0

## Basic Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Build the Project**:
   ```bash
   npm run build
   ```
   This compiles the AssemblyScript code into WebAssembly, along with any TypeScript modules used.

## License

This project is licensed under the MIT License. [View License](LICENSE.md) for more details.
