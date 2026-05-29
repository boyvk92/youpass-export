import { handleRequest } from '../server.js';

export default async (req, res) => {
  await handleRequest(req, res);
};
