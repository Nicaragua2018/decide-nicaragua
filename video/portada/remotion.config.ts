import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Las fotos, Honey y la música viven en assets/ (se leen con staticFile()).
Config.setPublicDir("./assets");
