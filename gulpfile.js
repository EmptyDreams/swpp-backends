const gulp = require('gulp')

gulp.task('copy-resources', () => gulp.src('src/resources/*.js').pipe(gulp.dest('dist/resources/')))