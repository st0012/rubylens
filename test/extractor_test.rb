# frozen_string_literal: true

require_relative "test_helper"

class ExtractorTest < Minitest::Test
  include SnapshotHelpers

  def setup
    @temporary_directory = Dir.mktmpdir("rubylens-extractor-")
  end

  def teardown
    FileUtils.remove_entry(@temporary_directory) if File.exist?(@temporary_directory)
  end

  def test_selects_only_tracked_or_unignored_rubydex_file_types
    repository = RubyLens::GitRepository.new(FIXTURE)
    relative_paths = repository.selected_files.map { |path| Pathname(path).relative_path_from(FIXTURE).to_s }

    assert_equal(
      ["config.ru", "lib/domain.rb", "lib/reopen.rb", "sig/domain.rbs", "tasks/demo.rake", "test/order_test.rb"],
      relative_paths,
    )
    refute_includes(relative_paths, "ignored.rb")
  end

  def test_rejects_ruby_symlinks_that_escape_the_target_root
    repository_root = File.join(@temporary_directory, "repo")
    external_root = File.join(@temporary_directory, "external")
    FileUtils.mkdir_p(repository_root)
    FileUtils.mkdir_p(external_root)
    system("git", "init", "-q", repository_root, exception: true)
    external_file = File.join(external_root, "private.rb")
    File.write(external_file, "PRIVATE_VALUE = 1\n")
    File.symlink(external_file, File.join(repository_root, "leak.rb"))

    selected = RubyLens::GitRepository.new(repository_root).selected_files

    assert_empty(selected)
  end

  def test_workspace_preflight_rejects_escaping_file_and_directory_symlinks
    repository_root = File.join(@temporary_directory, "workspace")
    external_root = File.join(@temporary_directory, "external-workspace")
    FileUtils.mkdir_p(File.join(repository_root, "lib"))
    FileUtils.mkdir_p(external_root)
    external_file = File.join(external_root, "secret.rb")
    File.write(external_file, "SecretOutside = 1\n")
    File.symlink(external_file, File.join(repository_root, "lib", "leak.rb"))
    File.symlink(external_root, File.join(repository_root, "external"))

    error = assert_raises(RubyLens::ExtractionError) do
      RubyLens::WorkspacePreflight.new(repository_root).validate!
    end

    assert_includes(error.message, "external")
    assert_includes(error.message, "lib/leak.rb")
    refute_includes(error.message, external_root)
    refute_includes(error.message, "SecretOutside")
  end

  def test_workspace_preflight_mirrors_rubydex_default_root_exclusions
    assert_equal(
      %w[.bundle .claude .git .github .ruby-lsp .vscode log node_modules tmp],
      RubyLens::WorkspacePreflight::DEFAULT_EXCLUDED_ROOT_ENTRIES,
    )
    repository_root = File.join(@temporary_directory, "excluded-workspace")
    external_root = File.join(@temporary_directory, "excluded-external")
    FileUtils.mkdir_p(File.join(repository_root, ".github"))
    FileUtils.mkdir_p(external_root)
    external_file = File.join(external_root, "secret.rb")
    File.write(external_file, "SecretOutside = 1\n")
    File.symlink(external_file, File.join(repository_root, ".github", "ignored.rb"))

    result = RubyLens::WorkspacePreflight.new(repository_root).validate!

    assert_equal({ "checked" => true, "escaping_symlinks" => [] }, result)
  end

  def test_control_snapshot_preserves_semantics_without_absolute_paths
    output = File.join(@temporary_directory, "snapshot")
    summary = RubyLens::Extractor.new(target_root: FIXTURE, output_dir: output, mode: "control").run

    assert_equal("complete", summary.fetch("status"))
    assert_equal("0.2.9", summary.dig("rubydex", "version"))
    assert_equal(6, summary.dig("totals", "selected_workspace_files"))
    assert_equal(7, summary.dig("totals", "documents"))
    assert_operator(summary.dig("totals", "definitions"), :>, 0)
    assert_equal(1, summary.dig("distributions", "document_path_category", "test"))
    assert_operator(summary.dig("origins", "by_kind", "builtin", "documents"), :>=, 1)

    declaration_payload = gzip_payload(File.join(output, "raw/declarations.json.gz"))
    declaration_names = gzip_payload(File.join(output, "raw/declaration_names.json.gz"))
    document_payload = gzip_payload(File.join(output, "raw/documents.json.gz"))
    reference_payload = gzip_payload(File.join(output, "raw/references.json.gz"))
    assert(declaration_payload.fetch("complete"))
    assert_equal(
      declaration_payload.fetch("records").map { |record| record.fetch("name") },
      declaration_names.fetch("records"),
    )
    order = declaration_payload.fetch("records").find { |record| record["name"] == "Demo::Order" }
    refute_nil(order)
    assert_equal(3, order.fetch("definition_count"))
    assert_includes(order.fetch("ancestors"), "Demo::Order")
    assert_includes(order.fetch("ancestors"), "Demo::Base")
    superclass_targets = order.fetch("definitions").filter_map { |definition| definition.dig("superclass", "target") }
    assert_includes(superclass_targets, "Demo::Base")
    mixin_kinds = order.fetch("definitions").flat_map { |definition| definition.fetch("mixins", []) }
      .map { |mixin| mixin.fetch("kind") }
    assert_includes(mixin_kinds, "include")
    assert_includes(mixin_kinds, "prepend")
    assert_includes(mixin_kinds, "extend")
    refute(document_payload.fetch("records").any? { |document| document.key?("method_references") })
    assert_equal(
      summary.dig("totals", "method_references"),
      reference_payload.dig("method", "records").length,
      "method occurrences belong only to the canonical global reference stream",
    )

    snapshot_text = Dir.glob(File.join(output, "**", "*"), File::FNM_DOTMATCH).select { |path| File.file?(path) }
      .map do |path|
        path.end_with?(".gz") ? Zlib::GzipReader.open(path, &:read) : File.read(path)
      end.join
    refute_includes(snapshot_text, FIXTURE.to_s)
    refute_includes(snapshot_text, "file://#{FIXTURE}")
  end

  def test_serializer_never_invokes_the_unsafe_visibility_api
    declaration = Object.new
    declaration.define_singleton_method(:name) { "SafeVisibilityProbe" }
    declaration.define_singleton_method(:unqualified_name) { "SafeVisibilityProbe" }
    declaration.define_singleton_method(:owner) { nil }
    declaration.define_singleton_method(:definitions) { [] }
    declaration.define_singleton_method(:references) { [] }
    declaration.define_singleton_method(:visibility) { raise "visibility must not be invoked" }
    extractor = RubyLens::Extractor.new(
      target_root: FIXTURE,
      output_dir: File.join(@temporary_directory, "visibility-probe"),
      mode: "control",
    )

    record = extractor.send(:serialize_declaration, declaration)

    assert_nil(record.fetch("visibility"))
  end
end
