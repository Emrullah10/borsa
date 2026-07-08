import helper from '@borsa-bot/helper';
import { boot } from './src/boot.js';

boot().catch(helper.exitOnError);
