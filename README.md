# SureYouDo.io Contracts

Welcome to the official repository for the SureYouDo.io smart contracts. This repository contains all the Solidity
contracts used to power SureYouDo.io, a decentralized application (DApp) that helps users commit to and achieve their
goals through blockchain technology.

[SureYouDo.io](https://sureyoudo.io) is set to launch on the Polygon network.

## Overview

SureYouDo.io is a Decentralized Application (DApp) that operates on the principle of commitment through staking. Users
set personal or group challenges and targets and lock in a monetary value via smart contracts as a pledge to achieve
those challenges. This unique approach leverages the accountability factor by introducing a financial stake, making the
journey towards achieving goals even more compelling.

## Getting Started

1. Clone the repository:

```bash
    git clone https://github.com/sureyoudo-io/SureYouDo.io-smart-contracts.git
```

2. Install the dependencies:

```bash
    npm install
```

3. Compile the contracts:

```bash
    npm run compile
```

## Deployment Commands

This section provides a guide on how to deploy the SureYouDo.io smart contracts on a blockchain network. It assumes that
[the SYD token](https://github.com/sureyoudo-io/SYD-OFT-LayerZero) is already deployed on the same network and you have
the address of the token contract.

1. **Environment Setup**: Create a `.env` file in the root directory of the project. You can use the `.env.example` file
   as a template.

2. **Contract Deployment**: Deploy the contracts to the network of your choice using the following command:

```bash
npx hardhat syd:deploy --network <NETWORK>
```

3. **Set SYD Token Address**: After deployment, set the address of the SYD token contract using the following command:

```bash
npx hardhat syd:set-syd-token-address --network <NETWORK> --address <SYD_TOKEN_ADDRESS>
```

### Additional Commands

- **Update Max Participants**: You can update the maximum number of participants using the following command:

```bash
npx hardhat syd:update-max-participants --network <NETWORK> --regular <REGULAR> --pro <PRO>
```

- **Update Min Platform Commission**: You can update the minimum platform commission using the following command:

```bash
npx hardhat syd:update-min-platform-commission --network <NETWORK> --regular <REGULAR> --pro <PRO>
```

- **Update Daily Reward**: You can update the daily reward using the following command:

```bash
npx hardhat syd:update-daily-reward-limit-per-user --network <NETWORK> --limit <LIMIT>
```

- **Add Charity**: You can add a charity using the following command:

```bash
npx hardhat syd:add-charity --network <NETWORK> --name <NAME> --address <ADDRESS>
```

Please replace `<NETWORK>` with the name of the network you want to deploy to, `<SYD_TOKEN_ADDRESS>` with the address of
the SYD token contract on that network, `<REGULAR>` and `<PRO>` with the respective values for regular and pro accounts.

## Contributing

We encourage public contributions! If you have a bug fix or new feature that you would like to contribute, please just
fork the repo and send a pull request. For larger changes, please open an issue first to discuss what you would like to
change.

## License

This project is licensed under the Apache 2.0 License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to all contributors who help maintain and improve this project.
- Special thanks to the Ethereum community for providing the tools and frameworks that make this possible.
