const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * Run a PHP script with optional args and environment vars.
 * @param {string} scriptPath - Full path to the PHP script.
 * @param {string[]} args - Script arguments.
 * @param {boolean} [waitForResult=false] - Whether to wait for script completion.
 * @returns {Promise<{ stdout: string, stderr: string }>|void}
 */
function runPhpScript(scriptPath, args = [], waitForResult = false) {
    const allEnv = {
        DB_HOST: process.env.HOST,
        DB_USER: process.env.USER,
        DB_PASSWORD: process.env.PASSWORD,
        DB_USPTO_DB: process.env.DATABASE_RAW,
        DB_APPLICATION_DB: process.env.DATABASE_APPLICATION_NEW,
        DB_RT_PWD: process.env.DB_RT_PWD,
        DB_BUSINESS: process.env.DB_BUSINESS,
        DB_APPLICATION_BIBLIO: process.env.DATABASE_GRANT_BIBLIO,
        DB_GRANT_BIBLIO: process.env.DATABASE_APPLICATION_BIBLIO,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
        AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION
    };

    const envVars = Object.entries(allEnv)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');

    const quotedArgs = args.map(arg => `"${arg}"`).join(' ');
    const command = `screen -md bash -c '${envVars} php -f ${scriptPath} ${quotedArgs}'`;

    console.log("Running:", command);

    if (waitForResult) {
        return execAsync(command);
    } else {
        exec(command, (err, stdout, stderr) => {
            if (err) logger.error("Non-blocking script error:", err);
            if (stderr) logger.error("Non-blocking script stderr:", stderr);
            if (stdout) logger.info("Non-blocking script stdout:", stdout);
        });
    }
}

module.exports = runPhpScript;