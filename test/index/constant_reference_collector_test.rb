# frozen_string_literal: true

require_relative "../test_helper"

class ConstantReferenceCollectorTest < Minitest::Test
  include SnapshotHelpers

  LINK_LIMIT = RubyLens::Index::ConstantReferenceCollector::LINK_LIMIT
  ATTRIBUTION_LIMIT = RubyLens::Index::ConstantReferenceCollector::ATTRIBUTION_LIMIT

  def test_links_use_workspace_origins_and_exact_namespace_or_dependency_targets
    Dir.mktmpdir("rubylens-reference-links-") do |directory|
      workspace = Pathname(directory).join("workspace")
      dependency = Pathname(directory).join("dependency-a")
      second_dependency = Pathname(directory).join("dependency-b")
      [workspace, dependency, second_dependency].each(&:mkpath)
      workspace = workspace.realpath
      dependency = dependency.realpath
      second_dependency = second_dependency.realpath
      workspace_source = workspace.join("source.rb")
      test_source = workspace.join("test/source_test.rb")
      dependency_source = dependency.join("source.rb")
      second_dependency_source = second_dependency.join("source.rb")
      test_source.dirname.mkpath
      workspace_source.write(<<~RUBY)
        class Target
        end

        class Outer
          class Inner
            FIRST = Target
            SECOND = Target
            SELF_REFERENCE = Inner
            UNRESOLVED_REFERENCE = MissingTarget
          end
        end

        class UsesDependency
          REFERENCE = DependencyTarget
        end

        TOP_LEVEL_REFERENCE = Target
      RUBY
      test_source.write(<<~RUBY)
        class TestUsesDependency
          REFERENCE = DependencyTarget
        end
      RUBY
      dependency_source.write(<<~RUBY)
        class DependencyTarget
        end

        class DependencyReferrer
          def self.workspace_reference
            Target
          end

          def self.test_reference
            TestUsesDependency
          end

          INTERNAL_REFERENCE = DependencyTarget
          CROSS_DEPENDENCY_REFERENCE = DependencyCrossTarget
        end
      RUBY
      second_dependency_source.write(<<~RUBY)
        class DependencyCrossTarget
        end
      RUBY
      manifest = workspace_manifest(workspace) do |stub_manifest|
        stub_manifest.define_singleton_method(:packages) { [Object.new, Object.new] }
        stub_manifest.define_singleton_method(:package_index_for) do |path|
          resolved = Pathname(path).realpath
          if resolved == dependency_source.realpath
            0
          elsif resolved == second_dependency_source.realpath
            1
          end
        rescue Errno::ENOENT
          nil
        end
      end
      locations = RubyLens::Index::LocationIndex.new(manifest)
      locations.package_document_paths.merge(
        [dependency_source.realpath.to_s, second_dependency_source.realpath.to_s],
      )
      graph = Rubydex::Graph.new(workspace_path: workspace.to_s)
      assert_empty(graph.index_all(
        [workspace_source.to_s, test_source.to_s, dependency_source.to_s, second_dependency_source.to_s],
      ))
      graph.resolve

      collected = RubyLens::Index::DeclarationCollector.new(manifest: manifest, locations: locations)
        .call(graph.declarations)
      summary = summarize(collected, graph, locations)
      ordinals = ordinal_by_name(collected)
      dependency_target = collected.dependency_ordinal_by_name.fetch("DependencyTarget")
      dependency_endpoint = collected.namespaces.length + dependency_target

      assert_equal(
        Set[
          [ordinals.fetch("Outer::Inner"), ordinals.fetch("Target")],
          [ordinals.fetch("UsesDependency"), dependency_endpoint],
          [ordinals.fetch("TestUsesDependency"), dependency_endpoint],
        ],
        summary.links.to_set,
      )
      assert_equal(3, summary.inbound_counts.fetch(ordinals.fetch("Target")))
      assert_equal(1, summary.inbound_counts.fetch(ordinals.fetch("Outer::Inner")))
      assert(summary.links.all? { |row| row.length == 2 && row.all?(Integer) })
      refute_includes(JSON.generate(summary.links), directory)
    end
  end

  def test_links_allow_every_workspace_category_pair
    Dir.mktmpdir("rubylens-workspace-reference-links-") do |directory|
      root = Pathname(directory).realpath
      core_source = root.join("lib/core_nodes.rb")
      test_source = root.join("test/test_nodes.rb")
      core_source.dirname.mkpath
      test_source.dirname.mkpath
      core_source.write(<<~RUBY)
        class CoreA
          TO_CORE = CoreB
          TO_TEST = TestA
        end

        class CoreB
        end
      RUBY
      test_source.write(<<~RUBY)
        class TestA
          TO_CORE = CoreA
          TO_TEST = TestB
        end

        class TestB
        end
      RUBY

      manifest = workspace_manifest(root) { |stub_manifest| stub_manifest.define_singleton_method(:packages) { [] } }
      locations = RubyLens::Index::LocationIndex.new(manifest)
      graph = Rubydex::Graph.new(workspace_path: root.to_s)
      assert_empty(graph.index_all([core_source.to_s, test_source.to_s]))
      graph.resolve

      collected = RubyLens::Index::DeclarationCollector.new(manifest: manifest, locations: locations)
        .call(graph.declarations)
      summary = summarize(collected, graph, locations)
      ordinals = ordinal_by_name(collected)

      assert_equal(
        Set[
          [ordinals.fetch("CoreA"), ordinals.fetch("CoreB")],
          [ordinals.fetch("CoreA"), ordinals.fetch("TestA")],
          [ordinals.fetch("TestA"), ordinals.fetch("CoreA")],
          [ordinals.fetch("TestA"), ordinals.fetch("TestB")],
        ],
        summary.links.to_set,
      )
      scope_by_name = collected.namespaces.to_h { |namespace| [namespace.name, namespace.scope] }
      assert_equal(0, scope_by_name.fetch("CoreA"))
      assert_equal(0, scope_by_name.fetch("CoreB"))
      assert_equal(1, scope_by_name.fetch("TestA"))
      assert_equal(1, scope_by_name.fetch("TestB"))
    end
  end

  def test_does_not_swallow_internal_selection_errors
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    locations = RubyLens::Index::LocationIndex.new(manifest)
    graph = Rubydex::Graph.new(workspace_path: manifest.root.to_s)
    assert_empty(graph.index_all(manifest.files))
    locations.resolve_documents(graph)
    graph.resolve
    collected = RubyLens::Index::DeclarationCollector.new(manifest: manifest, locations: locations)
      .call(graph.declarations)
    subject = RubyLens::Index::ConstantReferenceCollector.new(locations: locations)
    subject.define_singleton_method(:enclosing_namespace_ordinal) { |*| raise "broken range selection" }

    error = assert_raises(RuntimeError) { summarize(collected, graph, locations, subject: subject) }

    assert_equal("broken range selection", error.message)
  end

  def test_keeps_inbound_count_when_range_coordinates_are_unavailable
    location = stub(uri: "file:///workspace/source.rb")
    location.stubs(:comparable_values).raises("location unavailable")
    reference = resolved_reference(location: location, name: "Target")
    locations = RubyLens::Index::LocationIndex.new(stub(workspace_path?: true))

    summary = RubyLens::Index::ConstantReferenceCollector.new(locations: locations).call(
      graph: stub(constant_references: [reference]),
      namespaces: [namespace("Target", references: [reference])],
      definition_ranges: {},
      ordinal_by_name: { "Target" => 0 },
      dependency_ordinal_by_name: {},
      namespace_count: 1,
    )

    assert_equal({ 0 => 1 }, summary.inbound_counts)
    assert_empty(summary.links)
  end

  def test_attribution_selects_the_innermost_unambiguous_namespace
    subject = RubyLens::Index::ConstantReferenceCollector.new(locations: nil)
    uri = "file:///workspace/source.rb"
    ranges = {
      uri => [
        [1, 0, 100, 0, 0],
        [1, 0, 100, 0, 0],
        [10, 0, 20, 0, 1],
        [30, 0, 40, 0, 2],
        [30, 0, 40, 0, 3],
        [60, 0, 90, 0, 4],
        [60, 0, 80, 0, 5],
      ],
    }
    ordinal_at = lambda do |start_line, start_column, end_line, end_column|
      subject.send(:enclosing_namespace_ordinal, [uri, start_line, start_column, end_line, end_column], ranges)
    end

    assert_equal(1, ordinal_at.call(12, 0, 12, 5))
    assert_nil(ordinal_at.call(35, 0, 35, 5))
    assert_equal(0, ordinal_at.call(50, 0, 50, 5))
    assert_equal(5, ordinal_at.call(70, 0, 70, 5))
    assert_nil(ordinal_at.call(110, 0, 110, 5))
  end

  def test_bounds_attribution_without_truncating_inbound_counts
    uri = "file:///workspace/source.rb"
    location = stub(uri: uri, comparable_values: [uri, 2, 2, 2, 18])
    dependency_reference = resolved_reference(location: location, name: "DependencyTarget")
    late_workspace_reference = resolved_reference(location: location, name: "LateTarget")
    references = Array.new(ATTRIBUTION_LIMIT, dependency_reference) << late_workspace_reference
    locations = RubyLens::Index::LocationIndex.new(stub(workspace_path?: true))
    subject = RubyLens::Index::ConstantReferenceCollector.new(locations: locations)
    attributions = 0
    original = subject.method(:enclosing_namespace_ordinal)
    subject.define_singleton_method(:enclosing_namespace_ordinal) do |*arguments|
      attributions += 1
      original.call(*arguments)
    end

    summary = subject.call(
      graph: stub(constant_references: references),
      namespaces: [
        namespace("Origin", references: []),
        namespace("LateTarget", references: [late_workspace_reference]),
      ],
      definition_ranges: { uri => [[1, 0, 10, 0, 0]] },
      ordinal_by_name: { "Origin" => 0, "LateTarget" => 1 },
      dependency_ordinal_by_name: { "DependencyTarget" => 0 },
      namespace_count: 2,
    )

    assert_equal(ATTRIBUTION_LIMIT, attributions)
    assert_equal({ 1 => 1 }, summary.inbound_counts)
    assert_equal([[0, 2]], summary.links)
  end

  def test_nonworkspace_dependency_references_do_not_consume_the_attribution_budget
    external_uri = "file:///dependency/source.rb"
    workspace_uri = "file:///workspace/source.rb"
    external_reference = resolved_reference(
      location: stub(uri: external_uri, comparable_values: [external_uri, 2, 2, 2, 18]),
      name: "DependencyTarget",
    )
    workspace_reference = resolved_reference(
      location: stub(uri: workspace_uri, comparable_values: [workspace_uri, 2, 2, 2, 18]),
      name: "DependencyTarget",
    )
    manifest = Object.new
    manifest.define_singleton_method(:workspace_path?) { |path| path == "/workspace/source.rb" }
    references = Array.new(ATTRIBUTION_LIMIT, external_reference) << workspace_reference

    summary = RubyLens::Index::ConstantReferenceCollector.new(
      locations: RubyLens::Index::LocationIndex.new(manifest),
    ).call(
      graph: stub(constant_references: references),
      namespaces: [namespace("Origin", references: [])],
      definition_ranges: { workspace_uri => [[1, 0, 10, 0, 0]] },
      ordinal_by_name: { "Origin" => 0 },
      dependency_ordinal_by_name: { "DependencyTarget" => 0 },
      namespace_count: 1,
    )

    assert_equal([[0, 1]], summary.links)
  end

  def test_caps_unique_links
    declaration = Data.define(:name).new("DependencyTarget")
    location_class = Data.define(:uri, :line) do
      def comparable_values = [uri, line, 0, line, 1]
    end
    references = (0..LINK_LIMIT).map do |index|
      location = location_class.new("file:///workspace/source.rb", index)
      Rubydex::ResolvedConstantReference.allocate.tap do |reference|
        reference.define_singleton_method(:declaration) { declaration }
        reference.define_singleton_method(:location) { location }
      end
    end
    subject = RubyLens::Index::ConstantReferenceCollector.new(
      locations: RubyLens::Index::LocationIndex.new(stub(workspace_path?: true)),
    )
    subject.define_singleton_method(:enclosing_namespace_ordinal) { |values, _ranges| values.fetch(1) }

    summary = subject.call(
      graph: stub(constant_references: references),
      namespaces: [],
      definition_ranges: {},
      ordinal_by_name: {},
      dependency_ordinal_by_name: { "DependencyTarget" => 0 },
      namespace_count: LINK_LIMIT + 1,
    )

    assert_equal(LINK_LIMIT, summary.links.length)
    assert_equal(summary.links.uniq, summary.links)
  end

  private

  def summarize(collected, graph, locations, subject: nil)
    subject ||= RubyLens::Index::ConstantReferenceCollector.new(locations: locations)
    subject.call(
      graph: graph,
      namespaces: collected.namespaces,
      definition_ranges: collected.definition_ranges,
      ordinal_by_name: ordinal_by_name(collected),
      dependency_ordinal_by_name: collected.dependency_ordinal_by_name,
      namespace_count: collected.namespaces.length,
    )
  end

  def ordinal_by_name(collected)
    collected.namespaces.each_with_index.to_h { |namespace, index| [namespace.name, index] }
  end

  def namespace(name, references:)
    RubyLens::Index::DeclarationCollector::Namespace.new(
      declaration: stub(references: references),
      name: name,
      definition_sites: 1,
      scope: 0,
    )
  end

  def resolved_reference(location:, name:)
    Rubydex::ResolvedConstantReference.allocate.tap do |reference|
      reference.stubs(:location).returns(location)
      reference.stubs(:declaration).returns(stub(name: name))
    end
  end

  def workspace_manifest(root)
    manifest = Object.new
    manifest.define_singleton_method(:workspace_path?) { |path| RubyLens::Paths.inside?(path, root) }
    manifest.define_singleton_method(:relative_workspace_path) do |path|
      Pathname(path).relative_path_from(root).to_s
    end
    yield manifest if block_given?
    manifest
  end
end
