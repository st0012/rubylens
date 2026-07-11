# frozen_string_literal: true

require_relative "test_helper"

class BoundariesTest < Minitest::Test
  def test_expands_each_groups_only_from_manifest_workspace_files
    Dir.mktmpdir("rubylens-boundaries-") do |directory|
      root = Pathname(directory)
      workspace_files = [
        root.join("apps/acme-console/lib/console.rb").to_s,
        root.join("apps/acme-catalog/app/models/item.rb").to_s,
        root.join("apps/README.rb").to_s,
        root.join("components/acme-foundation/lib/foundation.rb").to_s,
      ]
      configuration = configuration_for(root)

      boundaries = RubyLens::Index::Boundaries.build(root:, workspace_files:, configuration:)

      assert_equal(
        %w[shared app-acme-catalog app-acme-console component-acme-foundation ungrouped],
        boundaries.groups.map(&:id),
      )
      refute_includes(boundaries.groups.map(&:id), "app-readme-rb")
      assert_equal(
        ["Shared core", "App · acme-catalog", "App · acme-console", "Component · acme-foundation", "Other"],
        boundaries.groups.map(&:label),
      )
      assert_equal("shared", boundaries.group_for("lib/example.rb").id)
      assert_equal("app-acme-console", boundaries.group_for("apps/acme-console/lib/example.rb").id)
      assert_equal("ungrouped", boundaries.group_for("tasks/example.rake").id)
    end
  end

  def test_generated_ids_are_collision_checked
    Dir.mktmpdir("rubylens-boundaries-") do |directory|
      root = Pathname(directory)
      workspace_files = [root.join("apps/Acme/lib/a.rb").to_s, root.join("apps/acme/lib/b.rb").to_s]
      configuration = configuration_for(root)

      error = assert_raises(RubyLens::Error) do
        RubyLens::Index::Boundaries.build(root:, workspace_files:, configuration:)
      end
      assert_equal("duplicate or colliding boundary group id: app-acme", error.message)
    end
  end

  def test_first_matching_rule_wins
    Dir.mktmpdir("rubylens-boundaries-") do |directory|
      root = Pathname(directory)
      path = root.join("boundaries.yml")
      File.write(path, <<~YAML)
        version: 1
        boundaries:
          groups:
            - { id: preferred, label: Preferred, paths: [apps/acme/**] }
            - { id: fallback, label: Fallback, paths: [apps/**] }
      YAML
      configuration = RubyLens::Configuration.resolve(root:, path:)
      boundaries = RubyLens::Index::Boundaries.build(root:, workspace_files: [], configuration:)

      assert_equal("preferred", boundaries.group_for("apps/acme/lib/example.rb").id)
    end
  end

  def test_ungrouped_error_is_deterministic
    Dir.mktmpdir("rubylens-boundaries-") do |directory|
      root = Pathname(directory)
      path = root.join("boundaries.yml")
      File.write(path, <<~YAML)
        version: 1
        boundaries:
          groups:
            - { id: core, label: Core, paths: [lib/**] }
          ungrouped: { mode: error }
      YAML
      configuration = RubyLens::Configuration.resolve(root:, path:)
      boundaries = RubyLens::Index::Boundaries.build(root:, workspace_files: [], configuration:)

      assert_raises(RubyLens::Error) { boundaries.group_for("tasks/example.rake") }
    end
  end

  private

  def configuration_for(root)
    path = root.join("boundaries.yml")
    File.write(path, <<~YAML)
      version: 1
      boundaries:
        groups:
          - id: shared
            label: Shared core
            paths: [lib/**, config/**]
          - each: apps/*
            id_prefix: app
            label: "App · %{basename}"
          - each: components/*
            id_prefix: component
            label: "Component · %{basename}"
        ungrouped:
          mode: group
          label: Other
    YAML
    RubyLens::Configuration.resolve(root:, path:)
  end
end
