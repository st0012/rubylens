# frozen_string_literal: true

require "json"
require_relative "artifact_marker"
require_relative "collection_generator"
require_relative "explorer_artifact"

module RubyLens
  class StitchGenerator
    def initialize(artifacts:, output: nil)
      @artifacts = Array(artifacts).dup
      @output = output
    end

    def call
      raise Error, "stitch requires at least two Explorer artifacts" if @artifacts.length < 2

      output = @output || File.join(Dir.pwd, CollectionGenerator::DEFAULT_COLLECTION_NAME)
      if @output.nil? && File.exist?(output) && !ArtifactMarker.present?(output, CollectionWriter::MARKER)
        raise Error, "default collection path already exists and is not a RubyLens collection"
      end

      artifacts = @artifacts.map { |path| ExplorerArtifact.read(path) }
      galaxy_payloads = artifacts.map { |artifact| JSON.generate(artifact.galaxy) }
      output_path = CollectionWriter.new.write(galaxy_payloads.freeze, output: output)
      projects = artifacts.map do |artifact|
        CollectionProjectResult.new(
          name: artifact.galaxy.fetch("projectName"),
          counts: artifact.galaxy.fetch("totals").freeze,
          warnings: artifact.warnings,
        )
      end

      CollectionResult.new(output_path:, projects: projects.freeze)
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end
  end
end
