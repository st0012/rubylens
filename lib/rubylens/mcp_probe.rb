# frozen_string_literal: true

require "fileutils"
require "json"
require "pathname"
require "rubydex/mcp_server"
require "time"

module RubyLens
  class MCPProbe
    PROFILES = {
      "rdoc" => [
        {
          "tool" => "search_declarations",
          "arguments" => { "query" => "RDoc::NormalClass", "kind" => "Class", "match_mode" => "exact", "limit" => 10 },
        },
        { "tool" => "get_declaration", "arguments" => { "name" => "RDoc::NormalClass" } },
        { "tool" => "get_descendants", "arguments" => { "name" => "RDoc::Context", "limit" => 50 } },
      ],
      "rails" => [
        {
          "tool" => "search_declarations",
          "arguments" => { "query" => "ActiveRecord::Base", "kind" => "Class", "match_mode" => "exact", "limit" => 10 },
        },
        { "tool" => "get_declaration", "arguments" => { "name" => "ActiveRecord::Base" } },
        { "tool" => "get_descendants", "arguments" => { "name" => "Rails::Engine", "limit" => 50 } },
      ],
    }.freeze
    OMITTED_RESPONSE_KEYS = %w[comment comments source source_code source_excerpt excerpt].freeze

    def initialize(target_root:, output_path:, summary_path: nil, profile: nil)
      @target_root = File.realpath(target_root)
      @output_path = File.expand_path(output_path)
      @summary_path = summary_path && File.expand_path(summary_path)
      @profile = profile || File.basename(@target_root)
      @classifier = OriginClassifier.new(@target_root)
    end

    def run
      repository = GitRepository.new(@target_root)
      WorkspacePreflight.new(@target_root).validate!
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      server = Rubydex::MCPServer::Server.new(root_path: @target_root)
      indexer = server.spawn_indexer
      indexer.join
      indexer.value
      index_seconds = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
      calls = [{ "tool" => "codebase_stats", "arguments" => {} }, *PROFILES.fetch(@profile, [])]
        .each_with_index.map do |call, index|
          execute_call(server, call.fetch("tool"), call.fetch("arguments"), index + 1)
        end
      stats_call = calls.first
      raise ExtractionError, "MCP codebase_stats failed" if stats_call.fetch("response_is_error")

      stats = stats_call.fetch("result")
      payload = {
        "schema" => "rubylens.mcp_probe.v2",
        "generated_at" => Time.now.utc.iso8601,
        "target" => {
          "name" => File.basename(@target_root),
          "git" => repository.metadata,
        },
        "rubydex_version" => Rubydex::VERSION,
        "transport" => "in_process_no_global_configuration",
        "index_safety" => WorkspacePreflight.research_mode_metadata,
        "tool" => "codebase_stats",
        "index_seconds" => index_seconds.round(6),
        "stats" => stats,
        "response_is_error" => stats_call.fetch("response_is_error"),
        "reconciliation" => reconcile(stats),
        "calls" => calls,
        "privacy" => {
          "comments" => false,
          "source_excerpts" => false,
          "absolute_paths" => false,
        },
      }
      FileUtils.mkdir_p(File.dirname(@output_path))
      File.write(@output_path, "#{JSON.pretty_generate(payload)}\n")
      payload
    end

    private

    def execute_call(server, tool, arguments, id)
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      response = server.handle(
        jsonrpc: "2.0",
        id: id,
        method: "tools/call",
        params: { name: tool, arguments: arguments },
      )
      outer_error = response[:error]
      content = response.dig(:result, :content)
      text = Array(content).find { |entry| entry[:type] == "text" }&.fetch(:text, nil)
      parsed = text && JSON.parse(text)
      {
        "tool" => tool,
        "arguments" => arguments,
        "seconds" => (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started).round(6),
        "response_is_error" => !outer_error.nil? || (response.dig(:result, :isError) || false),
        "error" => outer_error && sanitize_result(outer_error),
        "result" => parsed && sanitize_result(parsed),
      }
    rescue JSON::ParserError => error
      {
        "tool" => tool,
        "arguments" => arguments,
        "seconds" => (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started).round(6),
        "response_is_error" => true,
        "error" => { "message" => "MCP tool returned invalid JSON: #{error.message}" },
        "result" => nil,
      }
    end

    def reconcile(stats)
      return { "checked" => false, "reason" => "no workspace summary supplied" } unless @summary_path

      summary = JSON.parse(File.read(@summary_path))
      totals = summary.fetch("totals")
      expected = {
        "files" => totals.fetch("documents"),
        "declarations" => totals.fetch("declarations"),
        "definitions" => totals.fetch("definitions"),
        "constant_references" => totals.fetch("constant_references"),
        "method_references" => totals.fetch("method_references"),
        "breakdown_by_kind" => summary.dig("distributions", "declaration_kind"),
      }
      actual = stats.slice("files", "declarations", "definitions", "constant_references", "method_references")
      actual["breakdown_by_kind"] = stats.fetch("breakdown_by_kind").to_h do |kind, count|
        normalized_kind = kind == "<TODO>" ? "todo" : kind.gsub(/([a-z0-9])([A-Z])/, "\\1_\\2").downcase
        [normalized_kind, count]
      end
      differences = expected.each_with_object({}) do |(field, expected_value), result|
        actual_value = actual[field]
        result[field] = { "summary" => expected_value, "mcp" => actual_value } unless actual_value == expected_value
      end
      {
        "checked" => true,
        "summary_status" => summary.fetch("status"),
        "exact_match" => differences.empty?,
        "differences" => differences,
      }
    end

    def sanitize_result(value, key = nil)
      case value
      when Hash
        value.each_with_object({}) do |(child_key, child_value), result|
          child_key = child_key.to_s
          next if OMITTED_RESPONSE_KEYS.include?(child_key)

          result[child_key] = sanitize_result(child_value, child_key)
        end
      when Array
        value.map { |child| sanitize_result(child, key) }
      when String
        key == "path" ? safe_path(value) : sanitize_text(value)
      else
        value
      end
    end

    def safe_path(path)
      return sanitize_text(path) unless Pathname.new(path).absolute?

      origin = @classifier.classify_path(path)
      prefix = case origin.fetch("kind")
      when "gem", "tooling_gem"
        "#{origin.fetch("kind")}:#{origin.fetch("name")}@#{origin.fetch("version")}"
      else
        origin.fetch("kind")
      end
      "#{prefix}/#{origin.fetch("path")}".delete_suffix("/")
    rescue StandardError
      "<absolute-path>"
    end

    def sanitize_text(text)
      text.gsub(@target_root, "<workspace>")
        .gsub(%r{(?<![\w:>])/(?:[^/\s`'\"]+/)*[^/\s`'\"]+}, "<absolute-path>")
        .gsub(/[A-Za-z]:[\\\/](?:[^\\\/\s`'\"]+[\\\/])*[^\\\/\s`'\"]+/, "<absolute-path>")
        .gsub(/\\\\[^\\\s`'\"]+(?:\\[^\\\s`'\"]+)+/, "<absolute-path>")
    end
  end
end
