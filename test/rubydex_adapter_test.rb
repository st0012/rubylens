# frozen_string_literal: true

require_relative "test_helper"

class RubydexAdapterTest < Minitest::Test
  include SnapshotHelpers

  def test_real_adapter_returns_hover_identity_without_paths_or_source
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    adapter = RubyLens::Index::RubydexAdapter.new
    snapshot = adapter.index(manifest)
    serialized = JSON.generate(snapshot)

    assert_equal("rubylens.snapshot.v5", snapshot.fetch("schema"))
    refute(snapshot.key?("groups"))
    assert_equal("Tiny Repo", snapshot.fetch("project_name"))
    assert_equal(9, snapshot.fetch("namespaces").length)
    assert_equal(9, snapshot.fetch("namespace_names").length)
    assert_equal(9, snapshot.fetch("components").sum)
    assert(snapshot.fetch("namespaces").all? { |row| row.length == 14 && row.all?(Integer) })
    assert_equal({ "core" => [4, 4, 3, 1], "tests" => [1, 0, 0, 0] }, snapshot.fetch("category_stats"))
    assert_equal(6, snapshot.fetch("dependency_signal_maxima").length)
    assert_includes(snapshot.fetch("namespace_names"), "Demo::Order")
    order_index = snapshot.fetch("namespace_names").index("Demo::Order")
    assert_equal([1, 0, 2, 1, 1], snapshot.fetch("namespaces").fetch(order_index).last(5))
    order_test_index = snapshot.fetch("namespace_names").index("Demo::OrderTest")
    assert_equal(0, snapshot.fetch("namespaces").fetch(order_test_index).last)
    refute_includes(serialized, FIXTURE.to_s)
    refute_includes(serialized, "domain.rb")
    refute_includes(serialized, "PRIVATE_VALUE")
    assert_nil(adapter.instance_variable_get(:@location_path_cache))
    assert_nil(adapter.instance_variable_get(:@workspace_location_cache))
  end

  def test_preserves_known_project_acronyms
    adapter = RubyLens::Index::RubydexAdapter.allocate
    manifest = Struct.new(:root)

    assert_equal("IRB", adapter.send(:project_name, manifest.new(Pathname("/tmp/irb"))))
    assert_equal("RDoc", adapter.send(:project_name, manifest.new(Pathname("/tmp/rdoc"))))
  end

  def test_configured_snapshot_has_deterministic_ownership_exact_aggregates_and_no_paths
    with_synthetic_monorepo do |directory|
      manifest = RubyLens::Index::Manifest.build(root: directory)
      first = RubyLens::Index::RubydexAdapter.new.index(manifest)
      second = RubyLens::Index::RubydexAdapter.new.index(manifest)

      assert_equal(first, second)
      assert_equal("rubylens.snapshot.v6", first.fetch("schema"))
      assert_equal(
        [
          {
            "id" => "foundation", "name" => "Acme Foundation", "anchor_seed" => 1_412_334_502,
            "namespace_counts" => [1, 0, 0],
            "ruby_counts" => { "core" => [1, 0, 1, 1], "tests" => [0, 0, 0, 0] },
            "cross_group_namespaces" => 1,
          },
          {
            "id" => "app-acme-alpha", "name" => "Acme App · acme-alpha", "anchor_seed" => 3_723_487_693,
            "namespace_counts" => [1, 0, 1],
            "ruby_counts" => { "core" => [2, 0, 0, 0], "tests" => [0, 0, 0, 0] },
            "cross_group_namespaces" => 2,
          },
          {
            "id" => "app-acme-zeta", "name" => "Acme App · acme-zeta", "anchor_seed" => 577_949_547,
            "namespace_counts" => [1, 1, 0],
            "ruby_counts" => { "core" => [1, 0, 0, 0], "tests" => [1, 0, 0, 0] },
            "cross_group_namespaces" => 1,
          },
          {
            "id" => "ungrouped", "name" => "Other", "anchor_seed" => 178_442_524,
            "namespace_counts" => [1, 0, 0],
            "ruby_counts" => { "core" => [1, 0, 0, 0], "tests" => [0, 0, 0, 0] },
            "cross_group_namespaces" => 0,
          },
        ],
        first.fetch("groups"),
      )
      assert(first.fetch("namespaces").all? { |row| row.length == 14 && row.all?(Integer) })

      group_indexes = first.fetch("groups").each_with_index.to_h { |group, index| [group.fetch("id"), index] }
      owners = first.fetch("namespace_names").each_with_index.to_h do |name, index|
        [name, first.fetch("namespaces").fetch(index).first]
      end
      assert_equal(group_indexes.fetch("foundation"), owners.fetch("RuleTie"))
      assert_equal(group_indexes.fetch("app-acme-alpha"), owners.fetch("LexicalTie"))
      assert_equal(group_indexes.fetch("app-acme-alpha"), owners.fetch("CoreWins"))
      assert_equal(group_indexes.fetch("app-acme-zeta"), owners.fetch("TotalWins"))
      assert_equal(group_indexes.fetch("ungrouped"), owners.fetch("Unowned"))
      core_wins_row = first.fetch("namespaces").fetch(first.fetch("namespace_names").index("CoreWins"))
      assert_equal(2, core_wins_row.fetch(2))

      %w[core tests].each do |category|
        aggregate = first.fetch("groups").map { |group| group.fetch("ruby_counts").fetch(category) }
          .transpose.map(&:sum)
        assert_equal(first.fetch("category_stats").fetch(category), aggregate)
      end
      assert_equal(first.fetch("namespaces").length, first.fetch("groups").sum { |group| group.fetch("namespace_counts").sum })
      assert_equal(4, first.fetch("groups").sum { |group| group.fetch("cross_group_namespaces") })

      serialized = JSON.generate(first)
      refute_includes(serialized, directory)
      refute_includes(serialized, ".rubylens.yml")
      refute_includes(serialized, "apps/*")
      refute_includes(serialized, "ownership.rb")
      refute_includes(serialized, "file://")

      art = RubyLens::ArtModelBuilder.new(seed: 12).build(first)
      assert_equal("rubylens.art.v8", art.fetch("schema"))
      assert_equal(first.fetch("namespaces").length, art.dig("totals", "renderedNamespaces"))
    end
  end

  def test_safe_length_uses_size_and_falls_back_to_count
    adapter = RubyLens::Index::RubydexAdapter.allocate
    sized = Object.new
    sized.define_singleton_method(:size) { 7 }
    sized.define_singleton_method(:count) { raise "count should not be called" }
    counted = Object.new
    counted.define_singleton_method(:size) { nil }
    counted.define_singleton_method(:count) { 4 }
    raised_size = Object.new
    raised_size.define_singleton_method(:size) { raise "size unavailable" }
    raised_size.define_singleton_method(:count) { 5 }

    assert_equal(7, adapter.send(:safe_length, Struct.new(:records).new(sized), :records))
    assert_equal(4, adapter.send(:safe_length, Struct.new(:records).new(counted), :records))
    assert_equal(5, adapter.send(:safe_length, Struct.new(:records).new(raised_size), :records))
  end

  def test_configured_group_totals_cannot_silently_undercount
    groups = [{ "ruby_counts" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] } }]
    category_stats = { "core" => [1, 0, 0, 0], "tests" => [0, 0, 0, 0] }

    error = assert_raises(RubyLens::Error) do
      RubyLens::Index::RubydexAdapter.new.send(:validate_group_totals!, groups, category_stats)
    end
    assert_equal("group core aggregates do not reconcile with category totals", error.message)
    empty_stats = { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] }
    RubyLens::Index::RubydexAdapter.new.send(:validate_group_totals!, [], empty_stats)
  end

  def test_location_caches_are_cleared_when_indexing_fails
    adapter = RubyLens::Index::RubydexAdapter.new(graph_factory: ->(_root) { raise "index failed" })
    manifest = Struct.new(:root).new(Pathname("/tmp/example"))

    assert_raises(RuntimeError) { adapter.index(manifest) }
    assert_nil(adapter.instance_variable_get(:@location_path_cache))
    assert_nil(adapter.instance_variable_get(:@workspace_location_cache))
  end

  def test_collects_declarations_without_materializing_the_enumerable
    declarations = Object.new
    declarations.define_singleton_method(:each) { |_block = nil, &block| [].each(&block) }
    declarations.define_singleton_method(:to_a) { raise "must stream declarations" }
    manifest = Struct.new(:packages).new([])

    collected = RubyLens::Index::RubydexAdapter.new.send(:collect_declarations, declarations, manifest)

    assert_empty(collected.fetch(:workspace_records))
    assert_equal({ "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] }, collected.fetch(:category_stats))
    assert_empty(collected.fetch(:dependency_aggregation).packages)
  end

  def test_dependency_extraction_failure_cannot_silently_undercount
    declaration = Object.new
    declaration.define_singleton_method(:definitions) { raise "broken definitions" }
    manifest = Struct.new(:packages).new([Object.new])

    error = assert_raises(RuntimeError) do
      RubyLens::Index::RubydexAdapter.new.send(:collect_dependency_declaration, Object.new, declaration, manifest)
    end
    assert_equal("broken definitions", error.message)
  end

  def test_non_file_definitions_are_intentionally_ineligible_for_packages
    location = Struct.new(:uri).new("https://example.test/builtin.rbs")
    manifest = Object.new
    manifest.define_singleton_method(:package_index_for) { raise "non-file locations must not be indexed" }

    assert_nil(RubyLens::Index::RubydexAdapter.new.send(:package_index_for_location, location, manifest))
  end

  def test_compacts_dependency_declarations_without_embedding_their_names
    Dir.mktmpdir("rubylens-package-declarations-") do |directory|
      lib = File.join(directory, "lib")
      Dir.mkdir(lib)
      File.write(File.join(lib, "client.rb"), "class DependencyClient < Minitest::Test\nend\n")
      File.write(
        File.join(directory, "Gemfile.lock"),
        <<~LOCKFILE,
          GEM
            remote: https://rubygems.org/
            specs:
              minitest (6.0.6)

          PLATFORMS
            arm64-darwin

          DEPENDENCIES
            minitest (= 6.0.6)

          BUNDLED WITH
             4.0.1
        LOCKFILE
      )
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", "lib/client.rb", "Gemfile.lock", exception: true)

      snapshot = RubyLens::Index::RubydexAdapter.new.index(RubyLens::Index::Manifest.build(root: directory))
      package = snapshot.fetch("packages").find { |row| row.fetch("name") == "minitest" }

      assert(package)
      assert_equal(package.fetch("declarations").length, package.fetch("declaration_count"))
      refute_empty(package.fetch("declarations"))
      assert(package.fetch("declarations").all? { |row| row.length == 7 && row.all?(Integer) })
      refute_includes(JSON.generate(snapshot), directory)
      refute_includes(JSON.generate(snapshot), "Minitest::Test")
    end
  end


  private

  def with_synthetic_monorepo
    Dir.mktmpdir("rubylens-synthetic-monorepo-") do |directory|
      files = {
        "components/acme-foundation/lib/ownership.rb" => <<~RUBY,
          class RuleTie
            FOUNDATION = true
            def foundation; end
          end
        RUBY
        "apps/acme-alpha/lib/ownership.rb" => <<~RUBY,
          class LexicalTie; end
          class CoreWins; end
          class TotalWins; end
        RUBY
        "apps/acme-zeta/lib/ownership.rb" => <<~RUBY,
          class RuleTie; end
          class LexicalTie; end
          class TotalWins; end
          class TotalWins; end
        RUBY
        "apps/acme-zeta/test/core_wins_test.rb" => "class CoreWins; end\nclass SyntheticTestOnly; end\n",
        "misc/unowned.rb" => "class Unowned; end\n",
      }
      files.each do |relative, contents|
        path = File.join(directory, relative)
        FileUtils.mkdir_p(File.dirname(path))
        File.write(path, contents)
      end
      File.write(File.join(directory, ".rubylens.yml"), <<~YAML)
        version: 1
        boundaries:
          groups:
            - id: foundation
              label: Acme Foundation
              paths: [components/acme-foundation/**]
            - each: apps/*
              id_prefix: app
              label: "Acme App · %{basename}"
          ungrouped:
            mode: group
            label: Other
      YAML
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", ".", exception: true)
      yield directory
    end
  end
end
