const path = require('path');
require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin');
const BrowserSyncPlugin = require('browser-sync-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');

const IS_PROD = process.env.NODE_ENV === 'production';

const outputPath = path.resolve(__dirname, 'dist');

const phaserRoot = path.join(__dirname, 'node_modules/phaser/build/custom/');

const phaserPath = path.join(phaserRoot, 'phaser-split.js');
const pixiPath = path.join(phaserRoot, 'pixi.js');
const p2Path = path.join(phaserRoot, 'p2.js');

const bs = new BrowserSyncPlugin(
  {
    open: false,
    host: 'localhost',
    port: 4000,
    proxy: 'http://localhost:3000/'
  },
  {
    reload: false
  }
);

PLUGINS = IS_PROD ? [] : [bs];

function exposeRules(modulePath, name) {
  return {
    test: (path) => modulePath === path,
    loader: 'expose-loader',
    options: name
  };
}

module.exports = {
  devtool: IS_PROD ? false : 'cheap-source-map',
  mode: process.env.NODE_ENV,
  entry: {
    pacman: path.resolve(__dirname, 'src/index.ts')
  },
  context: path.resolve(__dirname, 'src'),
  output: {
    path: outputPath,
    filename: `[name]${IS_PROD ? '.[chunkhash]' : ''}.bundle.js`,
    publicPath: ''
  },
  resolve: {
    modules: ['node_modules'],
    extensions: ['.ts', '.js'],
    alias: {
      pixi: pixiPath,
      phaser: phaserPath,
      p2: p2Path
    }
  },
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: ['ts-loader']
      },
      exposeRules(pixiPath, 'PIXI'),
      exposeRules(p2Path, 'p2'),
      exposeRules(phaserPath, 'Phaser')
    ]
  },
  optimization: {
    minimizer: [
      new UglifyJsPlugin({
        uglifyOptions: {
          output: {
            comments: !IS_PROD
          },
          mangle: IS_PROD,
          warnings: !IS_PROD,
          compress: {
            drop_console: IS_PROD
          },
        }
      })
    ]
  },
  plugins: [
    new CleanWebpackPlugin(),
    new CopyWebpackPlugin([
      {
        from: path.join(__dirname, 'assets/**/*'),
        to: path.join(__dirname, 'dist/assets/')
      },
      {
        from: path.join(__dirname, 'src/*.{js,ico,png,svg,xml,webapp,css}'),
        to: path.join(__dirname, 'dist/')
      }
    ]),
    new HtmlWebpackPlugin({
      title: 'Pacman PWA',
      inject: 'head',
      template: 'index.html'
    }),
    new ScriptExtHtmlWebpackPlugin({
      defaultAttribute: 'defer',
    }),
    ...PLUGINS
  ],
  devServer: {
    contentBase: outputPath,
    compress: true,
    port: 3000
  }
};
