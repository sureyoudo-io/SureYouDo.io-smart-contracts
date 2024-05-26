import fs from "fs";
import path from "path";
import logger from "./logger";

export type DeployReport = {
  executedAt: string;
  deployedAt: {
    SureYouDo: string;
    SydChallengeManager: string;
    SydCharityManager: string;
  };
};

export type SetSydTokenAddressReport = {
  executedAt: string;
  address: string;
};

export type AddCharityReport = {
  executedAt: string;
  address: string;
  name: string;
};

export type UpdateMaxParticipantsReport = {
  executedAt: string;
  regular: string;
  pro: string;
};

export type UpdateMinPlatformCommissionReport = UpdateMaxParticipantsReport;

export type UpdateDailyRewardLimitPerUserReport = {
  executedAt: string;
  rewardLimit: string;
};

export type UpdateMinimumProAccountBalanceReport = {
  executedAt: string;
  minBalance: string;
};

type ReportFactory = {
  readReport: <T>(name: string) => T | undefined;
  writeReport: <T>(name: string, data: T) => void;
};

const reportsDir = path.join(__dirname, "../..", "reports");

const readReport = <T>(name: string, network: string): T | undefined => {
  const reportFile = path.join(reportsDir, `${name}/${network}.json`);
  if (fs.existsSync(reportFile)) {
    try {
      return JSON.parse(fs.readFileSync(reportFile, "utf8"));
    } catch (error) {
      logger.error(`Error reading ${name} report: ${error}`);
    }
  } else {
    logger.warn(`No report found for "${name}" on ${network} network`);
  }
};

const writeReport = <T>(name: string, data: T, network: string): void => {
  const reportFile = path.join(reportsDir, `${name}/${network}.json`);
  if (!fs.existsSync(path.dirname(reportFile))) {
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  }
  fs.writeFileSync(reportFile, JSON.stringify(data, null, 2));
  logger.info(
    `Report written to ${path.relative(path.join(reportsDir, ".."), reportFile)}`,
  );
};

const reportFactory = (network: string): ReportFactory => {
  return {
    readReport: <T>(name: string) => readReport<T>(name, network),
    writeReport: <T>(name: string, data: T) => writeReport(name, data, network),
  };
};

export default reportFactory;
