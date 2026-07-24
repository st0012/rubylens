# frozen_string_literal: true

require "json"
require_relative "art_model_builder"
require_relative "atomic_output"
require_relative "errors"

module RubyLens
  class ExplorerArtifact
    SCHEMA = "rubylens.explorer.v1"
    DEFAULT_NAME = "rubylens-explorer.json"

    attr_reader :galaxy, :warnings

    def self.read(path)
      path = File.expand_path(path)
      payload = JSON.parse(File.binread(path))
      unless payload.is_a?(Hash)
        raise Error, "explorer artifact must contain a JSON object"
      end
      unless payload["schema"] == SCHEMA
        raise Error, "unsupported explorer artifact schema: #{payload["schema"].inspect}"
      end

      new(galaxy: payload["galaxy"], warnings: payload["warnings"])
    rescue JSON::ParserError => error
      raise Error, "invalid explorer artifact JSON: #{error.message}"
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end

    def self.owned?(path)
      payload = JSON.parse(File.binread(path))
      payload.is_a?(Hash) && payload["schema"] == SCHEMA
    rescue JSON::ParserError, Errno::ENOENT, Errno::EACCES, Errno::ELOOP
      false
    end

    def initialize(galaxy:, warnings:)
      unless galaxy.is_a?(Hash) && galaxy["schema"] == ArtModelBuilder::SCHEMA
        raise Error, "explorer artifact galaxy must use #{ArtModelBuilder::SCHEMA}"
      end
      unless warnings.is_a?(Array) && warnings.all? { |warning| warning.is_a?(String) }
        raise Error, "explorer artifact warnings must be an array of strings"
      end

      @galaxy = galaxy
      @warnings = warnings.dup.freeze
    end

    def write(output:)
      payload = JSON.generate(
        "schema" => SCHEMA,
        "galaxy" => galaxy,
        "warnings" => warnings,
      )
      AtomicOutput.replace(output) { |temporary| File.binwrite(temporary, payload) }
    end
  end
end
