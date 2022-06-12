import { ObjectId } from 'mongodb';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Queue from 'bull';
import path from 'path';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const fileQueue = new Queue('fileQueue', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

class FilesController {
  static async getUserFromToken(req) {
    const authToken = req.header('X-Token') || null;
    if (!authToken) return null;

    const key = `auth_${authToken}`;
    const user = await redisClient.get(key);
    if (!user) return null;

    const userCollection = dbClient.db.collection('users');
    const dbUser = await userCollection.findOne({ _id: ObjectId(user) });
    if (!dbUser) return null;
    return dbUser;
  }

  static pathExists(path) {
    return new Promise((resolve) => {
      fs.access(path, fs.constants.F_OK, (error) => {
        resolve(!error);
      });
    });
  }

  static async writeToFile(res, filePath, data, fileData) {
    await fs.promises.writeFile(filePath, data, 'utf-8');

    const filesCollection = dbClient.db.collection('files');
    const result = await filesCollection.insertOne(fileData);

    const response = {
      ...fileData,
      id: result.insertedId,
    };

    delete response._id;
    delete response.localPath;

    if (response.type === 'image') {
      fileQueue.add({ userId: response.userId, fileId: response.id });
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(201).json(response);
  }

  static async postUpload(req, res) {
    const user = await FilesController.getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const acceptedTypes = ['folder', 'file', 'image'];
    const {
      name,
      type,
      parentId,
      isPublic,
      data,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if ((!type || !acceptedTypes.includes(type))) return res.status(400).json({ error: 'Missing type' });
    if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });

    if (parentId) {
      const filesCollection = dbClient.db.collection('files');
      const parent = await filesCollection.findOne({ _id: ObjectId(parentId) });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }
    const fileData = {
      name,
      type,
      parentId: parentId || 0,
      isPublic: isPublic || false,
      userId: user._id.toString(),
    };

    if (type === 'folder') {
      const filesCollection = dbClient.db.collection('files');
      const result = await filesCollection.insertOne(fileData);
      fileData.id = result.insertedId;
      delete fileData._id;
      res.setHeader('Content-Type', 'application/json');
      return res.status(201).json(fileData);
    }
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    const fileName = uuidv4();
    const filePath = path.join(folderPath, fileName);

    fileData.localPath = filePath;
    const decodedData = Buffer.from(data, 'base64');
    const pathExists = await FilesController.pathExists(folderPath);
    if (!pathExists) {
      await fs.promises.mkdir(folderPath, { recursive: true });
    }
    return FilesController.writeToFile(res, filePath, decodedData, fileData);
  }

  static async getIndex(req, res) {
    const user = await FilesController.getUserFromToken(req);
    if (!user) return res.status(200).json({ error: 'Unauthorized' });

    const { parentId, page } = req.query;

    const filesCollection = dbClient.db.collection('files');

    const pageNo = page || 1;
    const pageSize = 20;
    const skip = (pageNo - 1) * pageSize;

    const query = !parentId ? { userId: user._id.toString() }
      : { userId: user._id.toString(), parentId };

    const data = await filesCollection.aggregate([
      { $match: query },
      { $skip: skip },
      { $limit: pageSize },
    ]);

    const response = data.map((file) => {
      const newData = {
        ...file,
        id: file._d,
      };
      delete newData._id;
      delete newData.localPath;
      return newData;
    });
    return res.status(200).json(response);
  }

  static async getShow(req, res) {
    const user = await FilesController.getUserFromToken(req);
    if (!user) return res.status(200).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const filesCollection = dbClient.db.collection('files');
    const file = filesCollection.findOne({ _id: ObjectId(id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Not found' });

    file.id = file._id;
    delete file._id;
    delete file.localPath;

    return res.status(200).json({ file });
  }
}

export default FilesController;
