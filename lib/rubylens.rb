# frozen_string_literal: true

require_relative "rubylens/version"
require_relative "rubylens/errors"
require_relative "rubylens/paths"
require_relative "rubylens/git_repository"
require_relative "rubylens/index/manifest"
require_relative "rubylens/index/rubydex_adapter"
require_relative "rubylens/art_model_builder"
require_relative "rubylens/report_writer"
require_relative "rubylens/generator"

module RubyLens
  module_function

  def generate(path: Dir.pwd, output: nil, lockfile: nil)
    Generator.new.call(path: path, output: output, lockfile: lockfile)
  end
end

require_relative "rubylens/cli"
