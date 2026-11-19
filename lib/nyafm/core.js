// Storage facade: Upstash Redis if its env vars are set, otherwise Turso/libSQL (or a local SQLite file).
import * as sql from './store-sql.js';
import * as redis from './store-redis.js';
import { useRedis } from './redis.js';

export { periodRange, randomToken, artKey } from './util.js';
export const backend = () => (useRedis() ? 'upstash-redis' : 'libsql');
const B = () => (useRedis() ? redis : sql);

const FNS = [
  'userCount', 'createUser', 'getUser', 'getUserById', 'getUserByToken', 'firstUser', 'authenticate', 'regenerateToken', 'changePassword',
  'sessionCreate', 'sessionUser', 'sessionDelete', 'authTokenCreate', 'authTokenGet', 'authTokenApprove', 'authTokenDelete',
  'artGet', 'artSet', 'artMany',
  'addScrobbles', 'setNowPlaying', 'getNowPlaying', 'clearNowPlaying', 'deleteScrobble',
  'setLoved', 'isLoved', 'lovedTracks', 'lovedSet',
  'recent', 'top', 'summary', 'timeline', 'artistInfo', 'trackInfo', 'exportPage',
];
for (const f of FNS) {
  if (typeof sql[f] !== 'function' || typeof redis[f] !== 'function') throw new Error(`storage backend missing ${f}`);
}

export const userCount = (...a) => B().userCount(...a);
export const createUser = (...a) => B().createUser(...a);
export const getUser = (...a) => B().getUser(...a);
export const getUserById = (...a) => B().getUserById(...a);
export const getUserByToken = (...a) => B().getUserByToken(...a);
export const firstUser = (...a) => B().firstUser(...a);
export const authenticate = (...a) => B().authenticate(...a);
export const regenerateToken = (...a) => B().regenerateToken(...a);
export const changePassword = (...a) => B().changePassword(...a);
export const sessionCreate = (...a) => B().sessionCreate(...a);
export const sessionUser = (...a) => B().sessionUser(...a);
export const sessionDelete = (...a) => B().sessionDelete(...a);
export const authTokenCreate = (...a) => B().authTokenCreate(...a);
export const authTokenGet = (...a) => B().authTokenGet(...a);
export const authTokenApprove = (...a) => B().authTokenApprove(...a);
export const authTokenDelete = (...a) => B().authTokenDelete(...a);
export const artGet = (...a) => B().artGet(...a);
export const artSet = (...a) => B().artSet(...a);
export const artMany = (...a) => B().artMany(...a);
export const addScrobbles = (...a) => B().addScrobbles(...a);
export const setNowPlaying = (...a) => B().setNowPlaying(...a);
export const getNowPlaying = (...a) => B().getNowPlaying(...a);
export const clearNowPlaying = (...a) => B().clearNowPlaying(...a);
export const deleteScrobble = (...a) => B().deleteScrobble(...a);
export const setLoved = (...a) => B().setLoved(...a);
export const isLoved = (...a) => B().isLoved(...a);
export const lovedTracks = (...a) => B().lovedTracks(...a);
export const lovedSet = (...a) => B().lovedSet(...a);
export const recent = (...a) => B().recent(...a);
export const top = (...a) => B().top(...a);
export const summary = (...a) => B().summary(...a);
export const timeline = (...a) => B().timeline(...a);
export const artistInfo = (...a) => B().artistInfo(...a);
export const trackInfo = (...a) => B().trackInfo(...a);
export const exportPage = (...a) => B().exportPage(...a);
