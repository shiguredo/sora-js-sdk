import browserify from "browserify";
import gulp from "gulp";
import runSequence from "run-sequence";
import buffer from "vinyl-buffer";
import source from "vinyl-source-stream";


gulp.task("dist", callback => {
  return runSequence.use(gulp)(
      "compile",
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
