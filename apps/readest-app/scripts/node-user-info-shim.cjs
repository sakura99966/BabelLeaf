const os = require('node:os');
const { syncBuiltinESMExports } = require('node:module');

try {
  os.userInfo();
} catch (error) {
  if (error?.info?.code !== 'ENOMEM') throw error;

  const username = process.env.USERNAME || 'babelleaf-test-user';
  const homedir = process.env.USERPROFILE || os.homedir();
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username,
    homedir,
    shell: null,
  });
  syncBuiltinESMExports();
}
