# frozen_string_literal: true

require_relative "default_output"
require_relative "generator"
require_relative "showcase_model"
require_relative "showcase_writer"

module RubyLens
  class ShowcaseGenerator
    DEFAULT_SHOWCASE_NAME = "rubylens-showcase.html"

    def initialize(path: Dir.pwd, output: nil, lockfile: nil, details: false)
      @path = path
      @output = output
      @lockfile = lockfile
      @details = details
    end

    def call
      root = File.realpath(@path)
      showcase_writer = ShowcaseWriter.new
      output = @output || DefaultOutput.resolve(root: root, name: DEFAULT_SHOWCASE_NAME, description: "showcase") do |existing|
        showcase_writer.rubylens_showcase?(existing)
      end
      model, warnings = GenerationPipeline.new(root:, lockfile: @lockfile).call
      output_path = showcase_writer.write(ShowcaseModel.new(model, details: @details).call, output: output)

      Result.new(output_path:, counts: model.fetch("totals").freeze, warnings:)
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end
  end
end
