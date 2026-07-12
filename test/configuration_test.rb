# frozen_string_literal: true

require_relative "test_helper"

class ConfigurationTest < Minitest::Test
  def test_absent_and_disabled_configuration_preserve_unconfigured_mode
    Dir.mktmpdir("rubylens-config-") do |directory|
      absent = RubyLens::Configuration.resolve(root: directory)
      disabled = RubyLens::Configuration.resolve(root: directory, disabled: true)

      refute(absent.configured?)
      refute(disabled.configured?)
      assert_equal(:absent, absent.source)
      assert_equal(:disabled, disabled.source)
      assert_empty(absent.rules)
      assert_nil(absent.ungrouped)
    end
  end

  def test_explicit_configuration_takes_precedence_and_is_strict
    with_config(<<~YAML) do |path|
      version: 1
      boundaries:
        groups:
          - id: shared
            label: Shared core
            paths:
              - lib/**
              - config/**
          - each: apps/*
            id_prefix: app
            label: "App · %{basename}"
        ungrouped:
          mode: group
          label: Other
    YAML
      configuration = RubyLens::Configuration.resolve(root: "/unused", path: path)

      assert(configuration.configured?)
      assert_equal(:explicit, configuration.source)
      assert_equal(%w[shared], configuration.rules.filter_map(&:id))
      assert_equal("apps/*", configuration.rules.last.each)
      assert_equal("group", configuration.ungrouped.mode)
      assert_equal("association", configuration.explorer_layout)
    end
  end

  def test_atlas_is_an_explicit_explorer_only_presentation_option
    with_config(<<~YAML) do |path|
      version: 1
      boundaries:
        groups: []
      presentation:
        explorer_layout: atlas
    YAML
      configuration = RubyLens::Configuration.resolve(root: "/unused", path: path)

      assert_equal("atlas", configuration.explorer_layout)
    end
  end

  def test_rejects_unknown_explorer_layout
    with_config(<<~YAML) do |path|
      version: 1
      boundaries:
        groups: []
      presentation:
        explorer_layout: automatic
    YAML
      error = assert_raises(RubyLens::Error) do
        RubyLens::Configuration.resolve(root: "/unused", path: path)
      end

      assert_equal("presentation.explorer_layout must be association or atlas", error.message)
    end
  end

  def test_explicit_and_disabled_modes_take_precedence_over_discovery
    Dir.mktmpdir("rubylens-config-root-") do |root|
      File.write(File.join(root, ".rubylens.yml"), "version: 99\nboundaries: { groups: [] }\n")
      with_config("version: 1\nboundaries: { groups: [] }\n") do |path|
        assert_equal(:explicit, RubyLens::Configuration.resolve(root:, path:).source)
      end
      assert_equal(:disabled, RubyLens::Configuration.resolve(root:, disabled: true).source)
    end
  end

  def test_discovers_target_configuration
    with_config("version: 1\nboundaries: { groups: [] }\n") do |path|
      configuration = RubyLens::Configuration.resolve(root: File.dirname(path))

      assert(configuration.configured?)
      assert_equal(:discovered, configuration.source)
    end
  end

  def test_rejects_conflicting_flags_before_reading_the_file
    error = assert_raises(RubyLens::Error) do
      RubyLens::Configuration.resolve(root: "/unused", path: "/missing/private.yml", disabled: true)
    end

    assert_equal("--config and --no-config cannot be used together", error.message)
  end

  def test_rejects_missing_explicit_configuration
    error = assert_raises(RubyLens::Error) do
      RubyLens::Configuration.resolve(root: "/unused", path: "/missing/private.yml")
    end

    assert_match(/configuration file not found/, error.message)
  end

  def test_rejects_aliases_object_tags_unknown_keys_and_unsafe_globs
    invalid_documents = [
      "version: 1\nboundaries: &rules\n  groups: []\ncopy: *rules\n",
      "--- !ruby/object:Object {}\n",
      "version: 1\nboundaries:\n  groups: []\n  secret: true\n",
      "version: 1\nversion: 1\nboundaries:\n  groups: []\n",
      "version: 1\nboundaries:\n  groups:\n    - id: escape\n      label: Escape\n      paths: [../private/**]\n",
      "version: 1\nboundaries:\n  groups:\n    - each: apps/{one,two}\n      id_prefix: app\n      label: App\n",
    ]

    invalid_documents.each do |document|
      with_config(document) do |path|
        assert_raises(RubyLens::Error) { RubyLens::Configuration.resolve(root: "/unused", path: path) }
      end
    end
  end

  def test_rejects_duplicate_explicit_ids
    with_config(<<~YAML) do |path|
      version: 1
      boundaries:
        groups:
          - { id: shared, label: One, paths: [lib/**] }
          - { id: shared, label: Two, paths: [config/**] }
    YAML
      error = assert_raises(RubyLens::Error) { RubyLens::Configuration.resolve(root: "/unused", path: path) }
      assert_equal("duplicate boundary group id: shared", error.message)
    end
  end

  def test_requires_exactly_one_yaml_document
    invalid_documents = [
      "",
      "# comments only\n",
      "---\n",
      "version: 1\nboundaries: { groups: [] }\n---\nversion: 1\nboundaries: { groups: [] }\n",
      "version: 1\nboundaries: { groups: [] }\n---\n",
    ]

    invalid_documents.each do |document|
      with_config(document) do |path|
        assert_raises(RubyLens::Error) { RubyLens::Configuration.resolve(root: "/unused", path: path) }
      end
    end
  end

  private

  def with_config(contents)
    Dir.mktmpdir("rubylens-config-") do |directory|
      path = File.join(directory, ".rubylens.yml")
      File.write(path, contents)
      yield path
    end
  end
end
