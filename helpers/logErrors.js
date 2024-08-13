const fs = require('fs');
const path = require('path');

// Function to log errors to a file
const logErrorToFile = (error) => { 
    const date = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(__dirname, `error-${date}.log`);
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${error.stack || error}\n`;

    fs.appendFile(logFilePath, logMessage, (err) => {
        if (err) {
            console.error('Failed to write to log file', err);
        }
    });
} 

module.exports = {
    logErrorToFile,
};