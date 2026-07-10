# frozen_string_literal: true

require "bundler/gem_tasks"
require "rake/testtask"

Rake::TestTask.new do |task|
  task.libs << "test"
  task.pattern = FileList["test/**/*_test.rb"].exclude("test/fixtures/**/*")
end

task default: :test
