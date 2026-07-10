# frozen_string_literal: true

require "bundler"
require "bundler/lockfile_parser"
require "digest"
require "fileutils"
require "json"
require "open3"
require "pathname"
require "rbconfig"
require "rubydex"
require "set"
require "time"
require "uri"
require "zlib"

module RubyLens
  RAW_SCHEMA = "rubylens.raw.v1"
  SUMMARY_SCHEMA = "rubylens.summary.v1"

  class ExtractionError < StandardError; end

  module Paths
    module_function

    def inside?(path, directory)
      path = File.expand_path(path)
      directory = File.expand_path(directory)
      path == directory || path.start_with?("#{directory}#{File::SEPARATOR}")
    end
  end

  class GitRepository
    INDEXABLE_EXTENSIONS = %w[.rb .rake .rbs .ru].freeze

    attr_reader :target_root, :git_root

    def initialize(target_root)
      @target_root = Pathname(target_root).expand_path.realpath
      raise ExtractionError, "target is not a directory" unless @target_root.directory?

      top, status = capture("rev-parse", "--show-toplevel")
      raise ExtractionError, "target must be inside a Git repository" unless status.success?

      @git_root = Pathname(top.strip).realpath
      unless Paths.inside?(@target_root, @git_root)
        raise ExtractionError, "target is outside its reported Git repository"
      end
    end

    def metadata
      head, head_status = capture("rev-parse", "--verify", "HEAD")
      branch, branch_status = capture("symbolic-ref", "--quiet", "--short", "HEAD")
      status_output, status_status = capture("status", "--porcelain=v1", "--untracked-files=normal")
      raise ExtractionError, "failed to read Git status" unless status_status.success?

      {
        "head" => head_status.success? ? head.strip : nil,
        "branch" => branch_status.success? ? branch.strip : nil,
        "dirty" => !status_output.empty?,
      }
    end

    def selected_files
      output, status = capture("ls-files", "-z", "--cached", "--others", "--exclude-standard")
      raise ExtractionError, "failed to enumerate tracked and unignored files" unless status.success?

      output.split("\0").filter_map do |relative_to_git|
        next unless INDEXABLE_EXTENSIONS.include?(File.extname(relative_to_git))

        absolute = @git_root.join(relative_to_git).cleanpath
        next unless Paths.inside?(absolute, @target_root)
        next unless absolute.file?
        resolved = absolute.realpath
        next unless Paths.inside?(resolved, @target_root.realpath)

        absolute.to_s
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
        nil
      end.sort
    end

    private

    def capture(*arguments)
      directory = @git_root || @target_root
      stdout, _stderr, status = Open3.capture3("git", "-C", directory.to_s, *arguments)
      [stdout, status]
    end
  end

  class WorkspacePreflight
    # Mirrors Rubydex 0.2.9 rust/rubydex/src/config.rs DEFAULT_EXCLUDED_DIRECTORIES.
    DEFAULT_EXCLUDED_ROOT_ENTRIES = %w[
      .bundle .claude .git .github .ruby-lsp .vscode log node_modules tmp
    ].freeze

    def initialize(target_root)
      @target_root = Pathname(target_root).realpath
    end

    def self.research_mode_metadata(preflight: "passed_before_index")
      {
        "selection" => "bare Rubydex Graph#index_workspace",
        "research_only" => true,
        "production_safe" => false,
        "escaping_symlink_preflight" => preflight,
        "ignored_or_untracked_workspace_files_may_be_indexed" => true,
        "required_production_mode" => "Git-selected, realpath-audited workspace manifest plus audited dependency/RBS roots passed to Graph#index_all",
      }
    end

    def validate!
      findings = escaping_symlinks
      return { "checked" => true, "escaping_symlinks" => [] } if findings.empty?

      raise ExtractionError, "workspace indexing refused escaping symlink(s): #{findings.join(", ")}"
    end

    private

    def escaping_symlinks
      findings = []
      pending = [@target_root]
      until pending.empty?
        directory = pending.pop
        Dir.each_child(directory) do |entry|
          if directory == @target_root && DEFAULT_EXCLUDED_ROOT_ENTRIES.include?(entry)
            next
          end

          path = directory.join(entry)
          status = File.lstat(path)
          if status.symlink?
            inspect_symlink(path, findings)
          elsif status.directory?
            pending << path
          end
        rescue Errno::ENOENT, Errno::EACCES
          next
        end
      end
      findings.sort
    end

    def inspect_symlink(path, findings)
      indexable_file = GitRepository::INDEXABLE_EXTENSIONS.include?(path.extname)
      resolved = path.realpath
      directory_link = resolved.directory?
      return unless directory_link || indexable_file
      return if Paths.inside?(resolved, @target_root)

      findings << Pathname(path).relative_path_from(@target_root).to_s
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
      findings << Pathname(path).relative_path_from(@target_root).to_s if indexable_file
    end
  end

  class DependencyLedger
    attr_reader :records, :error

    def initialize(sanitizer, target_root, target_lockfile: nil)
      @sanitizer = sanitizer
      @target_root = target_root
      @target_lockfile = target_lockfile ? File.expand_path(target_lockfile) : File.join(target_root, "Gemfile.lock")
      @records = []
      @error = nil
      @target_lock_error = nil
    end

    def capture
      target_pairs = target_lock_pairs
      locked = Bundler.locked_gems
      if locked.nil?
        @error = "Bundler did not expose a locked dependency set"
        return payload
      end

      locked.specs.each do |lazy_spec|
        @records << record_for(lazy_spec, target_pairs)
      end
      payload
    rescue StandardError => error
      @error = @sanitizer.call(error.message)
      payload
    end

    private

    def record_for(lazy_spec, target_pairs)
      installed = Gem::Specification.find_by_name(lazy_spec.name)
      relative_require_paths = installed.require_paths.reject { |path| File.absolute_path?(path) }
      absolute_require_paths = installed.require_paths.length - relative_require_paths.length
      status = installed.version == lazy_spec.version ? "exact" : "fallback"

      {
        "name" => lazy_spec.name,
        "locked_version" => lazy_spec.version.to_s,
        "locked_platform" => lazy_spec.platform.to_s,
        "installed_version_used_by_rubydex" => installed.version.to_s,
        "status" => status,
        "scope" => dependency_scope(lazy_spec, target_pairs),
        "source_type" => source_type(lazy_spec),
        "relative_require_paths" => relative_require_paths,
        "skipped_absolute_require_path_count" => absolute_require_paths,
        "has_indexable_require_path" => !relative_require_paths.empty?,
      }
    rescue Gem::MissingSpecError
      {
        "name" => lazy_spec.name,
        "locked_version" => lazy_spec.version.to_s,
        "locked_platform" => lazy_spec.platform.to_s,
        "installed_version_used_by_rubydex" => nil,
        "status" => "missing",
        "scope" => dependency_scope(lazy_spec, target_pairs),
        "source_type" => source_type(lazy_spec),
        "relative_require_paths" => [],
        "skipped_absolute_require_path_count" => 0,
        "has_indexable_require_path" => false,
      }
    end

    def source_type(lazy_spec)
      lazy_spec.source.class.name.to_s.delete_prefix("Bundler::Source::").downcase
    rescue StandardError
      "unknown"
    end

    def target_lock_pairs
      path = @target_lockfile
      unless File.file?(path)
        @target_lock_error = "target has no Gemfile.lock"
        return nil
      end

      Bundler::LockfileParser.new(File.read(path)).specs.each_with_object(Set.new) do |specification, pairs|
        pairs << [specification.name, specification.version.to_s, specification.platform.to_s]
      end
    rescue StandardError => error
      @target_lock_error = @sanitizer.call(error.message)
      nil
    end

    def dependency_scope(lazy_spec, target_pairs)
      return "unknown" unless target_pairs

      key = [lazy_spec.name, lazy_spec.version.to_s, lazy_spec.platform.to_s]
      target_pairs.include?(key) ? "target_dependency" : "tooling"
    end

    def payload
      target_records = @records.select { |record| record["scope"] == "target_dependency" }
      tooling_records = @records.select { |record| record["scope"] == "tooling" }
      unknown_records = @records.select { |record| record["scope"] == "unknown" }
      {
        "complete" => @error.nil? && @target_lock_error.nil?,
        "error" => @error,
        "target_lock_error" => @target_lock_error,
        "counts" => {
          "target_locked" => target_records.length,
          "target_exact" => target_records.count { |record| record["status"] == "exact" },
          "target_fallback" => target_records.count { |record| record["status"] == "fallback" },
          "target_missing" => target_records.count { |record| record["status"] == "missing" },
          "target_without_indexable_require_path" => target_records.count { |record| !record["has_indexable_require_path"] },
          "tooling_locked" => tooling_records.length,
          "tooling_exact" => tooling_records.count { |record| record["status"] == "exact" },
          "tooling_fallback" => tooling_records.count { |record| record["status"] == "fallback" },
          "tooling_missing" => tooling_records.count { |record| record["status"] == "missing" },
          "unknown_scope" => unknown_records.length,
        },
        "records" => @records,
        "rubydex_behavior" => [
          "Graph#index_workspace reads process Bundler.locked_gems.",
          "Gem::Specification.find_by_name is called without the locked version constraint.",
          "Missing specifications and absolute require paths are skipped by Rubydex.",
          "The latest installed RBS core and stdlib trees are added separately.",
        ],
      }
    end
  end

  class OriginClassifier
    def initialize(workspace_root, tooling_gems: [])
      @workspace_root = canonical(workspace_root)
      @tooling_gems = tooling_gems.to_set
      @rbs_roots = rbs_roots
      @gem_roots = gem_roots
      @stdlib_roots = stdlib_roots
    end

    def classify_uri(uri)
      parsed = URI.parse(uri)
      return builtin_origin(uri) if parsed.scheme == "rubydex"
      return unknown_uri_origin(uri) unless parsed.scheme == "file"

      classify_path(URI::RFC2396_PARSER.unescape(parsed.path))
    rescue URI::InvalidURIError
      unknown_uri_origin(uri)
    end

    def classify_path(path)
      path = canonical(path)
      return workspace_origin(path) if Paths.inside?(path, @workspace_root)

      if (entry = longest_prefix(path, @rbs_roots))
        return {
          "kind" => "rbs",
          "version" => entry.fetch("version"),
          "section" => entry.fetch("section"),
          "path" => File.join("rbs", entry.fetch("version"), relative(path, entry.fetch("root"))),
        }
      end

      if (entry = longest_prefix(path, @gem_roots))
        return {
          "kind" => entry.fetch("kind"),
          "name" => entry.fetch("name"),
          "version" => entry.fetch("version"),
          "path" => File.join("gems", "#{entry.fetch("name")}-#{entry.fetch("version")}", relative(path, entry.fetch("root"))),
        }
      end

      if (entry = longest_prefix(path, @stdlib_roots))
        return {
          "kind" => "stdlib",
          "path" => File.join("stdlib", relative(path, entry.fetch("root"))),
        }
      end

      {
        "kind" => "unknown",
        "path" => File.join("unknown", Digest::SHA256.hexdigest(path)[0, 12], File.basename(path)),
      }
    end

    def file_path_from_uri(uri)
      parsed = URI.parse(uri)
      return nil unless parsed.scheme == "file"

      canonical(URI::RFC2396_PARSER.unescape(parsed.path))
    rescue URI::InvalidURIError
      nil
    end

    def self.key(origin)
      case origin["kind"]
      when "gem", "tooling_gem"
        "#{origin["kind"]}:#{origin["name"]}@#{origin["version"]}"
      when "rbs"
        "rbs:#{origin["version"]}:#{origin["section"]}"
      else
        origin["kind"]
      end
    end

    private

    def canonical(path)
      File.realpath(path)
    rescue Errno::ENOENT, Errno::EACCES
      File.expand_path(path)
    end

    def relative(path, root)
      Pathname(path).relative_path_from(Pathname(root)).to_s
    end

    def workspace_origin(path)
      {
        "kind" => "workspace",
        "path" => relative(path, @workspace_root),
      }
    end

    def builtin_origin(uri)
      { "kind" => "builtin", "path" => uri }
    end

    def unknown_uri_origin(uri)
      scheme = URI.parse(uri).scheme || "none"
      {
        "kind" => "unknown",
        "path" => "uri:#{scheme}:#{Digest::SHA256.hexdigest(uri)[0, 12]}",
      }
    rescue URI::InvalidURIError
      { "kind" => "unknown", "path" => "uri:invalid:#{Digest::SHA256.hexdigest(uri)[0, 12]}" }
    end

    def rbs_roots
      Gem::Specification.find_all_by_name("rbs").flat_map do |specification|
        %w[core stdlib].filter_map do |section|
          root = File.join(specification.full_gem_path, section)
          next unless File.directory?(root)

          { "root" => canonical(root), "version" => specification.version.to_s, "section" => section }
        end
      end.sort_by { |entry| -entry.fetch("root").length }
    end

    def gem_roots
      Gem::Specification.to_a.filter_map do |specification|
        root = specification.full_gem_path
        next unless File.directory?(root)

        version = specification.version.to_s
        kind = @tooling_gems.include?([specification.name, version]) ? "tooling_gem" : "gem"
        { "root" => canonical(root), "name" => specification.name, "version" => version, "kind" => kind }
      rescue StandardError
        nil
      end.sort_by { |entry| -entry.fetch("root").length }
    end

    def stdlib_roots
      %w[rubylibdir archdir vendorlibdir sitelibdir].filter_map do |key|
        root = RbConfig::CONFIG[key]
        next unless root && File.directory?(root)

        { "root" => canonical(root) }
      end.uniq { |entry| entry.fetch("root") }.sort_by { |entry| -entry.fetch("root").length }
    end

    def longest_prefix(path, entries)
      entries.find { |entry| Paths.inside?(path, entry.fetch("root")) }
    end
  end

  class Recorder
    attr_reader :field_errors, :truncations

    def initialize(sanitizer)
      @sanitizer = sanitizer
      @field_errors = []
      @truncations = []
    end

    def field(scope, field, default = nil)
      yield
    rescue StandardError => error
      @field_errors << error_record(scope, field, error)
      default
    end

    def array(label, enumerable)
      records = []
      complete = true
      begin
        enumerable.each { |item| records << yield(item) }
      rescue StandardError => error
        complete = false
        @truncations << error_record(label, "array_iteration", error).merge("collected" => records.length)
      end
      [records, complete]
    end

    private

    def error_record(scope, field, error)
      {
        "scope" => scope,
        "field" => field,
        "error_class" => error.class.name,
        "message" => @sanitizer.call(error.message),
      }
    end
  end

  class Extractor
    MODES = %w[control workspace].freeze
    TOP_LIMIT = 20

    def initialize(target_root:, output_dir:, mode:, target_lockfile: nil)
      @target_root = File.realpath(target_root)
      @output_dir = File.expand_path(output_dir)
      @mode = mode.to_s
      @target_lockfile = target_lockfile
      raise ExtractionError, "mode must be control or workspace" unless MODES.include?(@mode)
      if Paths.inside?(@output_dir, @target_root)
        raise ExtractionError, "output directory must be outside the target repository"
      end

      @sanitizer = method(:sanitize_message)
      @recorder = Recorder.new(@sanitizer)
      @phase_errors = []
      @timings = {}
    end

    def run
      total_started = monotonic
      repository = timed("select_files") { GitRepository.new(@target_root) }
      git_metadata = repository.metadata
      selected_files = repository.selected_files
      timed("workspace_preflight") { WorkspacePreflight.new(@target_root).validate! } if @mode == "workspace"
      dependency_ledger = timed("dependency_audit") do
        DependencyLedger.new(@sanitizer, @target_root, target_lockfile: @target_lockfile).capture
      end
      tooling_gems = dependency_ledger.fetch("records").filter_map do |record|
        next unless record["scope"] == "tooling" && record["installed_version_used_by_rubydex"]

        [record.fetch("name"), record.fetch("installed_version_used_by_rubydex")]
      end
      classifier = OriginClassifier.new(@target_root, tooling_gems: tooling_gems)

      graph = Rubydex::Graph.new(workspace_path: @target_root)
      index_errors = timed("index") do
        @mode == "control" ? graph.index_all(selected_files) : graph.index_workspace
      end
      timed("resolve") { graph.resolve }
      integrity_failures = timed("integrity") do
        graph.check_integrity.map { |failure| sanitize_message(failure.message) }
      rescue StandardError => error
        @phase_errors << phase_error("integrity", error)
        []
      end

      raw = timed("collect") { collect_raw(graph, classifier, selected_files) }
      raw["dependencies"] = dependency_ledger
      raw["integrity_failures"] = integrity_failures

      FileUtils.mkdir_p(File.join(@output_dir, "raw"))
      artifacts = timed("write_raw") { write_raw_artifacts(raw) }
      @timings["total"] = elapsed(total_started)
      summary = build_summary(
        raw: raw,
        git_metadata: git_metadata,
        selected_files: selected_files,
        index_errors: index_errors.map { |error| sanitize_message(error) },
        integrity_failures: integrity_failures,
        artifacts: artifacts,
      )
      write_json(File.join(@output_dir, "summary.json"), summary)
      summary
    rescue StandardError => error
      @phase_errors << phase_error("run", error)
      raise
    end

    private

    def collect_raw(graph, classifier, selected_files)
      @classifier = classifier
      inputs = selected_files.map { |path| input_record(path) }
      documents, documents_complete = @recorder.array("graph.documents", graph.documents) do |document|
        serialize_document(document)
      end
      definitions = documents.each_with_index.flat_map do |document, document_index|
        document.fetch("definitions").each_with_index.map do |definition, definition_index|
          definition.merge("document_index" => document_index, "index_in_document" => definition_index)
        end
      end
      definitions_complete = documents_complete && documents.all? { |document| document.dig("completeness", "definitions") }
      declarations, declarations_complete = @recorder.array("graph.declarations", graph.declarations) do |declaration|
        serialize_declaration(declaration)
      end
      constant_references, constant_references_complete = @recorder.array(
        "graph.constant_references",
        graph.constant_references,
      ) { |reference| serialize_reference(reference) }
      method_references, method_references_complete = @recorder.array(
        "graph.method_references",
        graph.method_references,
      ) { |reference| serialize_reference(reference) }
      diagnostics, diagnostics_complete = @recorder.array("graph.diagnostics", graph.diagnostics) do |diagnostic|
        serialize_diagnostic(diagnostic)
      end

      {
        "metadata" => {
          "schema" => RAW_SCHEMA,
          "rubydex_version" => Rubydex::VERSION,
          "mode" => @mode,
          "locations_are_zero_based" => true,
          "index_safety" => @mode == "workspace" ? WorkspacePreflight.research_mode_metadata : {
            "selection" => "Git-selected explicit workspace files",
            "escaping_symlinks_outside_target_rejected" => true,
          },
        },
        "inputs" => { "complete" => true, "records" => inputs },
        "documents" => { "complete" => documents_complete, "records" => documents },
        "definitions" => { "complete" => definitions_complete, "records" => definitions },
        "declarations" => { "complete" => declarations_complete, "records" => declarations },
        "references" => {
          "constant" => { "complete" => constant_references_complete, "records" => constant_references },
          "method" => { "complete" => method_references_complete, "records" => method_references },
        },
        "diagnostics" => { "complete" => diagnostics_complete, "records" => diagnostics },
      }
    end

    def input_record(path)
      origin = @classifier.classify_path(path)
      {
        "path" => origin.fetch("path"),
        "origin" => origin,
        "bytes" => File.size(path),
        "extension" => File.extname(path),
        "path_category" => path_category(origin.fetch("path")),
        "component" => component(origin),
      }
    end

    def serialize_document(document)
      uri = @recorder.field("document", "uri", "invalid:") { document.uri }
      origin = @classifier.classify_uri(uri)
      path = @classifier.file_path_from_uri(uri)
      definitions, definitions_complete = @recorder.array("document:#{origin["path"]}:definitions", document.definitions) do |definition|
        serialize_definition(definition)
      end
      method_reference_count = @recorder.field("document:#{origin["path"]}", "method_reference_count") do
        document.method_references.count
      end

      {
        "origin" => origin,
        "path" => origin.fetch("path"),
        "uri_scheme" => uri_scheme(uri),
        "bytes" => path && File.file?(path) ? File.size(path) : nil,
        "extension" => File.extname(origin.fetch("path")),
        "path_category" => path_category(origin.fetch("path")),
        "component" => component(origin),
        "definitions" => definitions,
        "method_reference_count" => method_reference_count,
        "completeness" => {
          "definitions" => definitions_complete,
          "method_reference_count" => !method_reference_count.nil?,
        },
      }
    end

    def serialize_declaration(declaration)
      scope = @recorder.field("declaration", "name", "<unknown>") { declaration.name }
      definitions, definitions_complete = @recorder.array("declaration:#{scope}:definitions", declaration.definitions) do |definition|
        serialize_definition(definition)
      end
      record = {
        "name" => scope,
        "unqualified_name" => @recorder.field(scope, "unqualified_name") { declaration.unqualified_name },
        "kind" => rubydex_kind(declaration),
        "owner" => @recorder.field(scope, "owner") { declaration.owner&.name },
        "visibility" => nil,
        "definitions" => definitions,
        "definition_count" => definitions_complete ? definitions.length : nil,
        "reference_count" => reference_count(declaration, scope),
        "top_level_namespace" => top_level_namespace(scope),
        "origins" => definitions.filter_map { |definition| definition.dig("location", "origin") }
          .uniq { |origin| OriginClassifier.key(origin) },
        "completeness" => { "definitions" => definitions_complete },
      }

      return record unless declaration.is_a?(Rubydex::Namespace)

      ancestors, ancestors_complete = @recorder.array("declaration:#{scope}:ancestors", declaration.ancestors) { |item| item.name }
      descendants, descendants_complete = @recorder.array("declaration:#{scope}:descendants", declaration.descendants) { |item| item.name }
      members, members_complete = @recorder.array("declaration:#{scope}:members", declaration.members) { |item| item.name }
      record.merge!(
        "ancestors" => ancestors,
        "descendants" => descendants,
        "members" => members,
        "singleton_class" => @recorder.field(scope, "singleton_class") { declaration.singleton_class&.name },
      )
      record["completeness"].merge!(
        "ancestors" => ancestors_complete,
        "descendants" => descendants_complete,
        "members" => members_complete,
      )
      record
    end

    def reference_count(declaration, scope)
      return nil if defined?(Rubydex::Todo) && declaration.is_a?(Rubydex::Todo)

      @recorder.field(scope, "reference_count") { declaration.references.count }
    end

    def serialize_definition(definition)
      scope = "definition:#{rubydex_kind(definition)}"
      record = {
        "kind" => rubydex_kind(definition),
        "name" => @recorder.field(scope, "name") { definition.name },
        "declaration" => @recorder.field(scope, "declaration") { definition.declaration&.name },
        "deprecated" => @recorder.field(scope, "deprecated") { definition.deprecated? },
        "location" => @recorder.field(scope, "location") { serialize_location(definition.location) },
        "name_location" => @recorder.field(scope, "name_location") do
          location = definition.name_location
          location && serialize_location(location)
        end,
        "lexical_owner" => @recorder.field(scope, "lexical_owner") do
          owner = definition.lexical_owner
          owner && (owner.declaration&.name || owner.name)
        end,
        "lexical_nesting" => @recorder.field(scope, "lexical_nesting", []) do
          definition.lexical_nesting.map { |owner| owner.declaration&.name || owner.name }
        end,
      }
      if definition.respond_to?(:superclass)
        record["superclass"] = @recorder.field(scope, "superclass") do
          reference = definition.superclass
          reference && serialize_reference(reference)
        end
      end
      if definition.respond_to?(:mixins)
        record["mixins"] = @recorder.field(scope, "mixins", []) do
          definition.mixins.map do |mixin|
            {
              "kind" => rubydex_kind(mixin),
              "constant_reference" => serialize_reference(mixin.constant_reference),
            }
          end
        end
      end
      record
    end

    def serialize_reference(reference)
      record = {
        "kind" => rubydex_kind(reference),
        "location" => @recorder.field("reference", "location") { serialize_location(reference.location) },
      }
      case reference
      when Rubydex::ResolvedConstantReference
        target = @recorder.field("reference", "declaration") { reference.declaration.name }
        record.merge!("resolved" => true, "name" => target, "target" => target)
      when Rubydex::UnresolvedConstantReference
        record.merge!("resolved" => false, "name" => @recorder.field("reference", "name") { reference.name })
      when Rubydex::MethodReference
        record.merge!(
          "name" => @recorder.field("reference", "name") { reference.name },
          "receiver" => @recorder.field("reference", "receiver") { reference.receiver&.name },
          "resolution_scope" => "receiver_only",
        )
      end
      record
    end

    def serialize_diagnostic(diagnostic)
      {
        "rule" => @recorder.field("diagnostic", "rule") { diagnostic.rule.to_s },
        "message" => @recorder.field("diagnostic", "message") { sanitize_message(diagnostic.message) },
        "location" => @recorder.field("diagnostic", "location") { serialize_location(diagnostic.location) },
      }
    end

    def serialize_location(location)
      origin = @classifier.classify_uri(location.uri)
      {
        "origin" => origin,
        "path" => origin.fetch("path"),
        "start_line" => location.start_line,
        "start_column" => location.start_column,
        "end_line" => location.end_line,
        "end_column" => location.end_column,
      }
    end

    def build_summary(raw:, git_metadata:, selected_files:, index_errors:, integrity_failures:, artifacts:)
      declarations = raw.dig("declarations", "records")
      definitions = raw.dig("definitions", "records")
      documents = raw.dig("documents", "records")
      constant_references = raw.dig("references", "constant", "records")
      method_references = raw.dig("references", "method", "records")
      diagnostics = raw.dig("diagnostics", "records")
      dependency_counts = raw.dig("dependencies", "counts")
      origins = origin_summary(documents)
      complete = all_complete?(raw) && index_errors.empty? && integrity_failures.empty? &&
        @recorder.field_errors.empty? && @recorder.truncations.empty? && @phase_errors.empty?

      {
        "schema" => SUMMARY_SCHEMA,
        "status" => complete ? "complete" : "partial",
        "generated_at" => Time.now.utc.iso8601,
        "target" => {
          "name" => File.basename(@target_root),
          "mode" => @mode,
          "git" => git_metadata,
        },
        "rubydex" => {
          "version" => Rubydex::VERSION,
          "index_api" => @mode == "control" ? "Graph#index_all" : "Graph#index_workspace",
        },
        "index_safety" => @mode == "workspace" ? WorkspacePreflight.research_mode_metadata : {
          "selection" => "Git-selected explicit workspace files",
          "escaping_symlinks_outside_target_rejected" => true,
        },
        "totals" => {
          "selected_workspace_files" => selected_files.length,
          "documents" => raw.dig("documents", "complete") ? documents.length : nil,
          "declarations" => raw.dig("declarations", "complete") ? declarations.length : nil,
          "definitions" => raw.dig("definitions", "complete") ? definitions.length : nil,
          "orphan_definitions" => raw.dig("definitions", "complete") ? definitions.count { |definition| definition["declaration"].nil? } : nil,
          "constant_references" => raw.dig("references", "constant", "complete") ? constant_references.length : nil,
          "method_references" => raw.dig("references", "method", "complete") ? method_references.length : nil,
          "diagnostics" => raw.dig("diagnostics", "complete") ? diagnostics.length : nil,
          "index_errors" => index_errors.length,
          "integrity_failures" => integrity_failures.length,
        },
        "dependency_coverage" => dependency_counts.merge(
          "ledger_complete" => raw.dig("dependencies", "complete"),
          "claim" => dependency_claim(origins, dependency_counts),
        ),
        "origins" => origins,
        "distributions" => distributions(declarations, definitions, documents),
        "rankings" => rankings(declarations),
        "timings_seconds" => @timings.transform_values { |value| value.round(6) },
        "errors" => {
          "index" => index_errors,
          "field" => @recorder.field_errors,
          "phase" => @phase_errors,
        },
        "truncations" => @recorder.truncations,
        "unsupported_or_intentionally_omitted" => [
          "Rubydex 0.2.9 exposes method-call occurrences and optional receiver declarations, not a reliable method call graph.",
          "The Ruby API yields resolved ancestor declarations but does not expose whether the underlying chain was partial or cyclic.",
          "Dependency provenance is inferred from canonical document paths and audited against Bundler; it is not supplied by Graph.",
          "Source excerpts and definition comments are intentionally omitted for privacy.",
          "Direct superclass and mixins are recorded per class/module/singleton-class definition, including reopened definitions.",
          "Control selection follows Rubydex 0.2.9's .rb/.rake/.rbs/.ru extension set; .gemspec and extensionless Ruby files are not included.",
          "Overlay-only Rubydex runtime dependencies are classified as tooling_gem and excluded from target dependency proof.",
          "Declaration visibility is not invoked: Rubydex 0.2.9 aborts the process when translating module_function visibility.",
        ],
        "semantic_array_notes" => [
          "Documents are the authoritative complete definition stream; declaration definition arrays can omit orphan definitions.",
          "Rubydex ancestry and descendant arrays include the declaration itself; prepends can appear before self.",
          "rubydex:built-in is classified separately from workspace files.",
          "Raw arrays are untruncated unless their artifact complete flag is false and a truncation is recorded.",
        ],
        "privacy" => {
          "absolute_source_paths" => false,
          "source_excerpts" => false,
          "comments" => false,
        },
        "artifacts" => artifacts,
      }
    end

    def dependency_claim(origins, dependency_counts)
      return "not_applicable: control mode indexes only explicit workspace files" if @mode == "control"

      gem_counts = origins.dig("by_kind", "gem") || {}
      if dependency_counts["target_missing"].positive? || dependency_counts["target_fallback"].positive?
        "partial: locked dependencies were missing or resolved to fallback installed versions; consult raw/dependencies.json.gz"
      elsif gem_counts.fetch("documents", 0).positive?
        "observed: external gem documents and definitions are present, with exact locked versions available"
      else
        "not_observed: no external gem documents were classified"
      end
    end

    def all_complete?(raw)
      raw.dig("documents", "complete") && raw.dig("definitions", "complete") &&
        raw.dig("declarations", "complete") && raw.dig("references", "constant", "complete") &&
        raw.dig("references", "method", "complete") && raw.dig("diagnostics", "complete") &&
        (@mode == "control" || raw.dig("dependencies", "complete"))
    end

    def origin_summary(documents)
      by_key = Hash.new do |hash, key|
        hash[key] = { "documents" => 0, "definitions" => 0, "declarations" => Set.new, "representatives" => Set.new }
      end
      by_kind = Hash.new do |hash, key|
        hash[key] = { "documents" => 0, "definitions" => 0, "declarations" => Set.new, "representatives" => Set.new }
      end
      documents.each do |document|
        origin = document.fetch("origin")
        key = OriginClassifier.key(origin)
        [by_key[key], by_kind[origin.fetch("kind")]].each do |bucket|
          bucket["documents"] += 1
          bucket["definitions"] += document.fetch("definitions").length
          document.fetch("definitions").each do |definition|
            name = definition["declaration"] || definition["name"]
            next unless name

            bucket["declarations"] << name
            bucket["representatives"] << name
          end
        end
      end
      {
        "by_kind" => finalize_origins(by_kind),
        "by_exact_origin" => finalize_origins(by_key),
      }
    end

    def finalize_origins(origins)
      origins.keys.sort.to_h do |key|
        bucket = origins.fetch(key)
        [key, {
          "documents" => bucket.fetch("documents"),
          "definitions" => bucket.fetch("definitions"),
          "declarations" => bucket.fetch("declarations").length,
          "representative_declarations" => bucket.fetch("representatives").to_a.sort.first(10),
        }]
      end
    end

    def distributions(declarations, definitions, documents)
      {
        "declaration_kind" => tally(declarations) { |declaration| declaration.fetch("kind") },
        "top_level_namespace" => tally(declarations) { |declaration| declaration["top_level_namespace"] || "(none)" },
        "document_path_category" => tally(documents) { |document| document.fetch("path_category") },
        "document_component" => tally(documents) { |document| document.fetch("component") },
        "definition_path_category" => tally(definitions) do |definition|
          path = definition.dig("location", "path")
          path ? path_category(path) : "unknown"
        end,
        "definition_component" => tally(definitions) do |definition|
          origin = definition.dig("location", "origin")
          origin ? component(origin) : "unknown"
        end,
      }
    end

    def tally(records)
      records.each_with_object(Hash.new(0)) { |record, counts| counts[yield(record)] += 1 }
        .sort_by { |key, count| [-count, key] }.to_h
    end

    def rankings(declarations)
      namespaces = declarations.select { |declaration| declaration.key?("ancestors") }
      {
        "deepest_ancestor_chains" => namespaces.select { |declaration| declaration.dig("completeness", "ancestors") }
          .sort_by { |declaration| [-declaration.fetch("ancestors").length, declaration.fetch("name")] }
          .first(TOP_LIMIT)
          .map do |declaration|
            {
              "name" => declaration.fetch("name"),
              "api_count_including_self" => declaration.fetch("ancestors").length,
              "chain" => declaration.fetch("ancestors"),
            }
          end,
        "largest_descendant_hubs" => namespaces.select { |declaration| declaration.dig("completeness", "descendants") }
          .sort_by { |declaration| [-declaration.fetch("descendants").length, declaration.fetch("name")] }
          .first(TOP_LIMIT)
          .map do |declaration|
            descendants = declaration.fetch("descendants")
            {
              "name" => declaration.fetch("name"),
              "api_count_including_self" => descendants.length,
              "other_descendant_count" => descendants.count { |name| name != declaration.fetch("name") },
              "sample" => descendants.reject { |name| name == declaration.fetch("name") }.first(10),
            }
          end,
        "most_reopened_declarations" => declarations.select { |declaration| declaration["definition_count"].to_i > 1 }
          .sort_by { |declaration| [-declaration.fetch("definition_count"), declaration.fetch("name")] }
          .first(TOP_LIMIT)
          .map do |declaration|
            {
              "name" => declaration.fetch("name"),
              "kind" => declaration.fetch("kind"),
              "definition_count" => declaration.fetch("definition_count"),
            }
          end,
      }
    end

    def write_raw_artifacts(raw)
      payloads = {
        "raw/inputs.json.gz" => raw.fetch("inputs"),
        "raw/documents.json.gz" => raw.fetch("documents"),
        "raw/definitions.json.gz" => raw.fetch("definitions"),
        "raw/declarations.json.gz" => raw.fetch("declarations"),
        "raw/declaration_names.json.gz" => {
          "complete" => raw.dig("declarations", "complete"),
          "records" => raw.dig("declarations", "records").map { |declaration| declaration.fetch("name") },
        },
        "raw/references.json.gz" => raw.fetch("references"),
        "raw/diagnostics.json.gz" => raw.fetch("diagnostics"),
        "raw/dependencies.json.gz" => raw.fetch("dependencies"),
      }
      payloads.map do |relative_path, payload|
        path = File.join(@output_dir, relative_path)
        write_gzip_json(path, { "schema" => RAW_SCHEMA, "payload" => payload })
        { "path" => relative_path, "compressed_bytes" => File.size(path) }
      end
    end

    def write_gzip_json(path, payload)
      temporary = "#{path}.tmp"
      Zlib::GzipWriter.open(temporary) { |gzip| gzip.write(JSON.generate(payload)) }
      File.rename(temporary, path)
    ensure
      FileUtils.rm_f(temporary) if temporary && File.exist?(temporary)
    end

    def write_json(path, payload)
      temporary = "#{path}.tmp"
      File.write(temporary, "#{JSON.pretty_generate(payload)}\n")
      File.rename(temporary, path)
    ensure
      FileUtils.rm_f(temporary) if temporary && File.exist?(temporary)
    end

    def path_category(path)
      segments = path.split(File::SEPARATOR)
      segments.any? { |segment| %w[test tests spec specs feature features].include?(segment) } ? "test" : "source"
    end

    def component(origin)
      case origin.fetch("kind")
      when "workspace"
        path = origin.fetch("path")
        path.include?(File::SEPARATOR) ? path.split(File::SEPARATOR).first : "(root)"
      when "gem", "tooling_gem"
        "#{origin.fetch("kind")}:#{origin.fetch("name")}@#{origin.fetch("version")}"
      when "rbs"
        "rbs:#{origin.fetch("section")}"
      else
        origin.fetch("kind")
      end
    end

    def top_level_namespace(name)
      return nil unless name

      normalized = name.sub(/\A<Class:/, "").sub(/>.*\z/, "")
      normalized.split(/::|#|\./).first
    end

    def rubydex_kind(object)
      object.class.name.to_s.delete_prefix("Rubydex::")
        .gsub(/([a-z\d])([A-Z])/, "\\1_\\2").downcase
    end

    def uri_scheme(uri)
      URI.parse(uri).scheme || "none"
    rescue URI::InvalidURIError
      "invalid"
    end

    def sanitize_message(message)
      message.to_s.encode("UTF-8", invalid: :replace, undef: :replace)
        .gsub(@target_root, "<workspace>")
        .gsub(Dir.home, "~")
        .gsub(%r{(?<![\w:])/(?:[^/\s:]+/)*[^/\s:]+}, "<absolute-path>")
    end

    def timed(name)
      started = monotonic
      yield
    ensure
      @timings[name] = elapsed(started)
    end

    def phase_error(phase, error)
      {
        "phase" => phase,
        "error_class" => error.class.name,
        "message" => sanitize_message(error.message),
      }
    end

    def monotonic
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def elapsed(started)
      monotonic - started
    end
  end
end
