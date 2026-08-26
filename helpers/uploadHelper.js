const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');

/**
 * Reduce a user supplied filename to a plain ASCII, URL safe basename.
 * The result is stored in DB columns that are still latin1_swedish_ci, so any
 * character outside that charset makes the UPDATE fail with MySQL error 3988
 * ("Conversion from collation utf8mb4_unicode_ci into latin1_swedish_ci
 * impossible for parameter"). Plain ASCII names come back unchanged.
 */
const MAX_BASENAME = 120;

const sanitizeFilename = (filename) => {
    const clean = (part) => part
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^A-Za-z0-9._-]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '');

    const base = path.basename(String(filename));
    const rawExt = path.extname(base);

    // Keep the whole name short enough for the 255 byte filesystem limit and for
    // the varchar(255) columns the resulting URL is stored in.
    const ext = rawExt ? `.${clean(rawExt.slice(1)).slice(0, 10)}` : '';
    const stem = (clean(base.slice(0, base.length - rawExt.length)) || 'file')
        .slice(0, MAX_BASENAME - ext.length);

    const safe = `${stem}${ext}`;

    // "." / ".." would resolve to a directory in path.join()
    return /^\.+$/.test(safe) ? 'file' : safe;
};

const uploadFile = (fileData, bucketConfig, directory, filename, contentType = 'application/octet-stream') => {
    return new Promise((resolve, reject) => {
        filename = sanitizeFilename(filename);

        if (process.env.SAVE_TO_LOCAL === 'true') {
            const targetDir = path.join(process.env.STATIC_FILE_DISC_PATH, directory);
            const filePath = path.join(targetDir, filename);
            
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
    uploadFile,
    sanitizeFilename
};
