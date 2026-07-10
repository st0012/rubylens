# frozen_string_literal: true

require "rake/testtask"

Rake::TestTask.new do |task|
  task.libs << "test"
  task.pattern = FileList["test/**/*_test.rb"].exclude("test/fixtures/**/*")
end

task default: :test
