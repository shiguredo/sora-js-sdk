import gulp from "gulp";
import del from "del";
import uglify from "gulp-uglify";
import rename from "gulp-rename";
import header from "gulp-header";
import eslint from "gulp-eslint";
import plumber from "gulp-plumber";
import watchify from "gulp-watchify";
import runSequence from "run-sequence";
import buffer from "vinyl-buffer";
import pkg from "./package.json";


gulp.task("dist", callback => {
  return runSequence.use(gulp)(
      "clean",
      "compile:js",
      "header",
      "uglify",
      callback
      );
});

gulp.task("clean", () => {
  return del([
    "dist/**/*"
  ]);
});

let watching = false
gulp.task("enable-watch-mode", () => {
  watching = true;
});

gulp.task("compile:js", watchify((w) => {
  return gulp.src("src/sora.js")
    .pipe(plumber())
    .pipe(w({
      watch: watching,
      transform: ["babelify", "envify"]
    }))
    .pipe(buffer())
    .pipe(gulp.dest("dist"));
}));

gulp.task("watchify", ["enable-watch-mode", "compile:js"])

gulp.task("watch", ["watchify"], function () {
  gulp.watch("dist/sora.js", ["uglify"]);
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
  return gulp.src(["src/sora.js"])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});
