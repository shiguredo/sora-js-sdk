import browserify from "browserify";
import gulp from "gulp";
import uglify from "gulp-uglify";
import rename from "gulp-rename";
import header from "gulp-header";
import eslint from "gulp-eslint";
import runSequence from "run-sequence";
import buffer from "vinyl-buffer";
import source from "vinyl-source-stream";
import pkg from "./package.json";


gulp.task("dist", callback => {
  return runSequence.use(gulp)(
      "compile",
      "header",
      "uglify",
      callback
      );
});

gulp.task("compile", () => {
  return browserify({
    entries: "sora.js",
    debug: false,
    standalone: "Sora"
  })
  .transform("babelify")
  .bundle()
  .pipe(source("sora.js"))
  .pipe(buffer())
  .pipe(gulp.dest("dist"));
});

gulp.task("uglify", () => {
  return gulp.src(["dist/sora.js"])
    .pipe(uglify({ preserveComments: "some" }))
    .pipe(rename({ extname: ".min.js" }))
    .pipe(gulp.dest("dist"));
});

gulp.task("header", () => {
  let banner = `
/*!
 * <%= pkg.name %>
 * <%= pkg.description %>
 * @version <%= pkg.version %>
 * @author <%= pkg.author %>
 * @license <%= pkg.license %>
 */
`;
  return gulp.src(["dist/sora.js"])
    .pipe(header(banner, { pkg: pkg }))
    .pipe(gulp.dest("dist"));
});

gulp.task("eslint", () => {
  return gulp.src(["sora.js"])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});
