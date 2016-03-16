/*
 * grunt-contrib-jade
 * http://gruntjs.com/
 *
 * Copyright (c) 2016 Eric Woroshow, contributors
 * Licensed under the MIT license.
 */

'use strict';

function requireJade() {
  var constantinople = require('constantinople'),
    jade = require('jade');

  var parser = jade.Parser.prototype,
      runtime = jade.runtime,
      attr = runtime.attr,
      parseCode = parser.parseCode,
      parseEach = parser.parseEach;

  parser.parseCode = function () {
    var tok = this.expect('code');
    if (tok.isElse) throw new Error('else not supported by Polymer 1.3');
    if (!tok.isIf) return parseCode.apply(this, arguments);

    var val = tok.val.replace(/^if\b/, '').replace(/^\s*\(\s*([\s\S]*?)\s*\)\s*$/, '$1');
    this.lexer.defer({ type: 'tag', val: 'template', line: tok.line, selfClosing: false });
    this.lexer.defer({ type: 'attrs', val: null, attrs: [{ name: 'is', val: '"dom-if"', escaped: true }, { name: 'if', val: '"'+val+'"', escaped: true }], line: tok.line });
    return this.parseTag();
  }
  parser.parseEach = function () {
    var tok = this.expect('each');

    this.lexer.defer({ type: 'tag', val: 'template', line: tok.line, selfClosing: false });
    this.lexer.defer({ type: 'attrs', val: null, attrs: [{ name: 'is', val: '"dom-repeat"', escaped: true }, { name: 'items', val: '"{{'+tok.code+'}}"', escaped: true }, { name: 'as', val: '"'+tok.val+'"', escaped: true }], line: tok.line });
    return this.parseTag();
  }

  runtime.attr = function (key, val, escaped, terse) {
    return attr.apply(this, arguments);
  }

  return jade;
}

module.exports = function(grunt) {
  var lib = require('./lib/jade');
  var chalk = require('chalk');

  // content conversion for templates
  var defaultProcessContent = function(content) {
    return content;
  };

  // filename conversion for templates
  var defaultProcessName = function(name) {
    return name.replace('.jade', '');
  };

  grunt.registerMultiTask('jade', 'Compile jade templates.', function() {
    var options = this.options({
      namespace: 'JST',
      separator: grunt.util.linefeed + grunt.util.linefeed,
      amd: false
    });

    var data = options.data;
    delete options.data;

    var nsInfo;

    if (options.namespace !== false) {
      nsInfo = lib.getNamespaceDeclaration(options.namespace);
    }

    // assign transformation functions
    var processContent = options.processContent || defaultProcessContent;
    var processName = options.processName || defaultProcessName;

    this.files.forEach(function(f) {
      var templates = [];

      f.src.filter(function(filepath) {
        // warn on and remove invalid source files (if nonull was set)
        if (!grunt.file.exists(filepath)) {
          grunt.log.warn('Source file "' + filepath + '" not found.');
          return false;
        }
        return true;
      })
      .forEach(function(filepath) {
        var src = processContent(grunt.file.read(filepath), filepath);
        var compiled, filename;
        filename = processName(filepath);

        options.filename = filepath;

        try {
          var jade = f.orig.jade = requireJade();

          jade.Parser.protoype.parseConditional = function () {
            var tok = this.expect('if');
            console.log(tok.val, typeof tok.val);
          };

          if (typeof data === 'function') {
            // if data is function, bind to f.orig, passing f.dest and f.src
            f.orig.data = data.call(f.orig, f.dest, f.src);
          } else {
            f.orig.data = data;
          }
          if (options.filters) {
            Object.keys(options.filters).forEach(function(filter) {
              jade.filters[filter] = options.filters[filter].bind(f.orig);
            });
          }
          // if in client mode, return function source
          if (options.client) {
            compiled = jade.compileClient(src, options).toString();
          } else {
            compiled = jade.compile(src, options)(f.orig.data);
          }

          // if configured for AMD and the namespace has been explicitly set
          // to false, the Jade template will be directly returned
          if (options.client && options.amd && options.namespace === false) {
            compiled = 'return ' + compiled;
          }
        } catch (e) {
          grunt.log.error(e);
          grunt.fail.warn('Jade failed to compile "' + filepath + '".');
          return false;
        }

        if (options.client && options.namespace !== false) {
          templates.push(nsInfo.namespace + '[' + JSON.stringify(filename) + '] = ' + compiled + ';');
        } else {
          templates.push(compiled);
        }
      });

      var output = templates;
      if (output.length < 1) {
        grunt.log.warn('Destination not written because compiled files were empty.');
      } else {
        if (options.client && options.namespace !== false) {
          output.unshift(nsInfo.declaration);

          if (options.node) {
            output.unshift('var jade = jade || require(\'jade/lib/runtime\');');

            var nodeExport = 'if (typeof exports === \'object\' && exports) {';
            nodeExport += 'module.exports = ' + nsInfo.namespace + ';}';

            output.push(nodeExport);
          }
        }

        if (options.amd) {
          // wrap the file in an AMD define function
          output.unshift('define([\'jade\'], function(jade) { if(jade && jade[\'runtime\'] !== undefined) { jade = jade.runtime; }');
          if (options.namespace !== false) {
            // namespace has not been explicitly set to false;
            // the AMD wrapper will return the object containing the template
            output.push('return ' + nsInfo.namespace + ';');
          }
          output.push('});');
        }

        grunt.file.write(f.dest, output.join(grunt.util.normalizelf(options.separator)));
        grunt.verbose.writeln('File ' + chalk.cyan(f.dest) + ' created.');
      }
    });

    grunt.log.ok(this.files.length + ' ' + grunt.util.pluralize(this.files.length, 'file/files') + ' created.');

  });

};
