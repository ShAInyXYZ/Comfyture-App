import fs from 'node:fs';
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');

// Reuse claude-motion's headless Chrome when it is there, so nothing is downloaded.
const shell = `${process.env.HOME}/Documents/GitHub/claude-motion/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell`;
const browser = process.env.REMOTION_BROWSER ?? shell;
if (fs.existsSync(browser)) Config.setBrowserExecutable(browser);
