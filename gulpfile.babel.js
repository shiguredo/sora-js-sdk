import gulp from "gulp";
import del from "del";
import uglify from "gulp-uglify";
import rename from "gulp-rename";
import header from "gulp-header";
import browserify from "gulp-browserify";
import runSequence from "run-sequence";
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

gulp.task("compile:js", () => {
  return gulp.src("src/sora.js")
    .pipe(browserify({
      transform: ["babelify", "envify"],
      standalone: "Sora"
    }))
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
