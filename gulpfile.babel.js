import gulp from "gulp";
import del from "del";
import uglify from "gulp-uglify";
import rename from "gulp-rename";
import header from "gulp-header";
import plumber from "gulp-plumber";
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

gulp.task("compile:js", (w) => {
  return gulp.src("src/sora.js")
    .pipe(plumber())
    .pipe(w({
      transform: ["babelify", "envify"],
      standalone: "Sora"
    }))
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
