# frozen_string_literal: true

module RubyLens
  # File extensions RubyLens selects for indexing with Rubydex.
  INDEXABLE_EXTENSIONS = %w[.rb .rake .rbs .ru].freeze
end

require_relative "rubylens/version"
require_relative "rubylens/errors"
require_relative "rubylens/paths"
require_relative "rubylens/atomic_output"
require_relative "rubylens/default_output"
require_relative "rubylens/git_repository"
require_relative "rubylens/dependency_warning"
require_relative "rubylens/index/manifest"
require_relative "rubylens/index/rubydex_adapter"
require_relative "rubylens/morphology_classifier"
require_relative "rubylens/art_model_builder"
require_relative "rubylens/report_asset_assembler"
require_relative "rubylens/report_writer"
require_relative "rubylens/explorer_artifact"
require_relative "rubylens/generator"
require_relative "rubylens/collection_writer"
require_relative "rubylens/collection_generator"
require_relative "rubylens/stitch_generator"
require_relative "rubylens/showcase_model"
require_relative "rubylens/showcase_writer"
require_relative "rubylens/showcase_generator"
require_relative "rubylens/clip_generator"

module RubyLens
  module_function

  def generate_report(path: Dir.pwd, output: nil, lockfile: nil)
    Generator.new(path: path, output: output, lockfile: lockfile).call
  end

  def generate_showcase(path: Dir.pwd, output: nil, lockfile: nil, details: false)
    ShowcaseGenerator.new(path: path, output: output, lockfile: lockfile, details: details).call
  end

  def generate_clip(path: Dir.pwd, output: nil, lockfile: nil, details: false, progress: nil)
    ClipGenerator.new(path: path, output: output, lockfile: lockfile, details: details, progress: progress).call
  end
end
