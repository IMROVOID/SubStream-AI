import { RPMLimit } from "../../types";

let currentRPM: RPMLimit = 15;
let requestTimestamps: number[] = [];

export const setGlobalRPM = (rpm: RPMLimit) => {
  currentRPM = rpm;
  requestTimestamps = [];
  console.log(`Global Rate Limit set to: ${rpm}`);
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const enforceRateLimit = async () => {
  if (currentRPM === 'unlimited') return;
  const rpmLimit = typeof currentRPM === 'number' ? currentRPM : 15;
  if (rpmLimit <= 0) return;

  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(t => now - t < 60000);

  if (requestTimestamps.length >= rpmLimit) {
    const oldestRequest = requestTimestamps[0];
    const timeToWait = 60000 - (now - oldestRequest) + 100;
    
    console.warn(`Rate limit (${rpmLimit} RPM) hit. Waiting ${timeToWait}ms...`);
    await delay(timeToWait);
    await enforceRateLimit();
  } else {
    requestTimestamps.push(Date.now());
  }
};
