import browserify from "browserify";
import gulp from "gulp";
import uglify from "gulp-uglify";
import rename from "gulp-rename";
import runSequence from "run-sequence";
import buffer from "vinyl-buffer";
import source from "vinyl-source-stream";


gulp.task("dist", callback => {
  return runSequence.use(gulp)(
      "compile",
      "uglify",
      callback
      );
});

gulp.task("compile", () => {
  return browserify({
    entries: "sora.js",
    debug: false,
    standalone: 'Sora'
  })
  .transform("babelify")
  .bundle()
  .pipe(source("sora.js"))
  .pipe(buffer())
  .pipe(gulp.dest("dist"));
});

gulp.task("uglify", () => {
  return gulp.src(["dist/sora.js"])
    .pipe(uglify())
    .pipe(rename({extname: '.min.js'}))
    .pipe(gulp.dest("dist"));
});
