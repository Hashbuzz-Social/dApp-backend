import { Request } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';

interface UploadOptions {
    destination?: string;
    maxFileSize?: number;
    allowedMimeTypes?: string[];
    maxFiles?: number;
}

//src/V201/MiddleWare/media/storeInPublic.ts
const defaultOptions: UploadOptions = {
    destination: path.join(__dirname, '..', '..', '..', '..','public', 'uploads'),
    maxFileSize: 2 * 1024 * 1024, // 2 MB
    allowedMimeTypes: ['image/'],
    maxFiles: 2,
};

const createUploader = (options: UploadOptions = {}) => {
    const { destination, maxFileSize, allowedMimeTypes, maxFiles = defaultOptions.maxFiles } = {
        ...defaultOptions,
        ...options,
    };
    const finalAllowedMimeTypes = allowedMimeTypes || defaultOptions.allowedMimeTypes;

    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            const uploadPath = destination || path.join(__dirname, '..', '..', '..', '..', 'public', 'uploads');
            if (!fs.existsSync(uploadPath)) {
                fs.mkdirSync(uploadPath, { recursive: true });
            }
            cb(null, uploadPath);
        },
        filename: function (req, file, cb) {
            cb(null, Date.now() + '-' + file.originalname);
        },
    });

    const fileFilter = (
        req: Request,
        file: Express.Multer.File,
        cb: multer.FileFilterCallback
    ) => {
        if (finalAllowedMimeTypes && finalAllowedMimeTypes.some((type) => file.mimetype.startsWith(type))) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    };

    return multer({
        storage: storage,
        limits: { fileSize: maxFileSize },
        fileFilter: fileFilter,
    }).array('media', maxFiles);
};

export const tempStoreMediaOnDisk = createUploader();