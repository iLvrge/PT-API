const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');

const uploadFile = (fileData, bucketConfig, directory, filename, contentType = 'application/octet-stream') => {
    return new Promise((resolve, reject) => {
        if (process.env.SAVE_TO_LOCAL === 'true') {
            const fileBasename = filename.replace(/\s+/g, '-').replace(/\//g, '');
            const targetDir = path.join(process.env.STATIC_FILE_DISC_PATH, directory);
            const filePath = path.join(targetDir, fileBasename);
            
            // Ensure directory exists
            try {
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
            } catch (dirErr) {
                console.error("Directory creation error:", dirErr);
                return reject(dirErr);
            }
            
            fs.writeFile(filePath, fileData, (err) => {
                if (err) {
                    console.error("Local upload error:", err);
                    reject(err);
                } else {
                    const publicUrl = `${process.env.STATIC_FILES_URL}${directory}/${filename}`;
                    resolve({ 
                        Key: `${directory}/${filename}`, 
                        Location: publicUrl 
                    }); 
                }
            });
        } else {
            const s3 = new AWS.S3({
                credentials: {
                    accessKeyId: bucketConfig.accessKeyId,
                    secretAccessKey: bucketConfig.secretAccessKey,
                },
                region: bucketConfig.region
            });

            const params = {
                Key: `${directory}/${filename}`,
                Bucket: bucketConfig.bucketName,
                Body: fileData,
                ACL: 'public-read',
                ContentType: contentType,
                ContentDisposition: 'inline'
            };

            // Using upload() for better abstraction than putObject
            s3.upload(params, (err, data) => {
                if (err) {
                    console.error("S3 upload error:", err);
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        }
    });
};

module.exports = {
    uploadFile
};
