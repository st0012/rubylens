# frozen_string_literal: true

require_relative "rubylens/version"
require_relative "rubylens/errors"
require_relative "rubylens/paths"
require_relative "rubylens/git_repository"
require_relative "rubylens/configuration"
require_relative "rubylens/index/boundaries"
require_relative "rubylens/index/manifest"
require_relative "rubylens/index/rubydex_adapter"
require_relative "rubylens/art_model_builder"
require_relative "rubylens/report_asset_assembler"
require_relative "rubylens/report_writer"
require_relative "rubylens/generator"
require_relative "rubylens/showcase_model"
require_relative "rubylens/showcase_writer"
require_relative "rubylens/showcase_generator"

module RubyLens
  module_function

  def generate_report(path: Dir.pwd, output: nil, lockfile: nil, config: nil, no_config: false)
    Generator.new.call(path: path, output: output, lockfile: lockfile, config: config, no_config: no_config)
  end

  def generate_showcase(path: Dir.pwd, output: nil, lockfile: nil, config: nil, no_config: false)
    ShowcaseGenerator.new.call(path: path, output: output, lockfile: lockfile, config: config, no_config: no_config)
  end

  def generate(path: Dir.pwd, output: nil, lockfile: nil, config: nil, no_config: false)
    generate_report(path: path, output: output, lockfile: lockfile, config: config, no_config: no_config)
  end
end

require_relative "rubylens/cli"
