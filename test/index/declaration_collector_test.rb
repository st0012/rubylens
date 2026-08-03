# frozen_string_literal: true

require_relative "../test_helper"

class DeclarationCollectorTest < Minitest::Test
  include SnapshotHelpers

  def test_collects_every_eligible_dependency_row
    location_class = Data.define(:uri) do
      def comparable_values = [uri, 0, 0, 0, 1]
    end
    document_class = Data.define(:uri)
    definition_class = Data.define(:location, :document)
    declaration_class = Data.define(:name, :definitions, :references)
    paths = ["/deps/alpha/lib/alpha.rb", "/deps/beta/lib/beta.rb"]
    declarations = 30.times.map do |index|
      uri = "file://#{paths.fetch(index % 2)}"
      declaration_class.new(
        "Dependency#{index}",
        [definition_class.new(location_class.new(uri), document_class.new(uri))],
        Array.new(index % 7),
      )
    end
    manifest = stub(packages: [Object.new, Object.new], workspace_path?: false)
    manifest.stubs(:package_index_for).with(paths.fetch(0)).returns(0)
    manifest.stubs(:package_index_for).with(paths.fetch(1)).returns(1)
    locations = RubyLens::Index::LocationIndex.new(manifest)
    locations.package_document_paths.merge(paths)

    collected = collector(manifest: manifest, locations: locations).call(declarations)
    packages = collected.dependency_packages

    assert_equal(30, packages.sum { |package| package.fetch(:declarations).length })
    assert_equal([15, 15], packages.map { |package| package.fetch(:declarations).length })
    assert_equal([0, 1, 0, 0, 6, 0], collected.dependency_signal_maxima)
  end

  def test_filters_synthetic_declarations_rubydex_reports_but_rubylens_never_draws
    Dir.mktmpdir("rubylens-declaration-shapes-") do |directory|
      source_path = File.join(directory, "shapes.rb")
      File.write(source_path, <<~RUBY)
        class Named
          class << self
            def class_method; end
            class << self
              def nested_meta_method; end
            end
          end
        end

        Assigned = Class.new
        Class.new
        Module.new
        Missing::VALUE = 1
        class << Missing; end
        class Missing::Nested; end
      RUBY
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", "shapes.rb", exception: true)

      graph = Rubydex::Graph.new(workspace_path: directory)
      assert_empty(graph.index_all([source_path]))
      graph.resolve
      declarations = graph.declarations.to_a
      by_name = ->(name) { declarations.find { |declaration| declaration.name == name } }
      todo = declarations.find { |declaration| declaration.is_a?(Rubydex::Todo) && declaration.name == "Missing" }
      anonymous = declarations.select { |declaration| declaration.name.include?("<anonymous>") }
      manifest = RubyLens::Index::Manifest.build(root: directory)
      subject = collector(manifest: manifest)

      assert(subject.eligible?(by_name.call("Named::<Named>")))
      refute(subject.eligible?(by_name.call("Named::<Named>::<<Named>>")))
      refute(subject.eligible?(todo))
      refute(subject.eligible?(by_name.call("Missing::<Missing>")))
      assert(subject.eligible?(by_name.call("Missing::VALUE")))
      anonymous.each { |declaration| refute(subject.eligible?(declaration)) }

      snapshot = RubyLens::Index::RubydexAdapter.new(manifest).index

      assert_equal(%w[Assigned Missing::Nested Named], snapshot.fetch("namespace_names").sort)
      assert_equal({ "core" => [3, 0, 2, 1], "tests" => [0, 0, 0, 0] }, snapshot.fetch("category_stats"))
      refute_includes(JSON.generate(snapshot), "<anonymous>")
    end
  end

  def test_collects_declarations_without_materializing_the_enumerable
    declarations = stub(each: nil)
    declarations.expects(:to_a).never

    collected = collector(manifest: stub(packages: [])).call(declarations)

    assert_empty(collected.namespaces)
    assert_equal({ "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] }, collected.category_stats)
    assert_empty(collected.dependency_packages)
  end

  def test_dependency_extraction_failure_cannot_silently_undercount
    declaration = stub(name: "Broken")
    declaration.stubs(:definitions).raises("broken definitions")

    error = assert_raises(RuntimeError) do
      collector(manifest: stub(packages: [Object.new])).call([declaration])
    end
    assert_equal("broken definitions", error.message)
  end

  def test_unreadable_signal_counts_degrade_to_zero_rather_than_dropping_the_star
    subject = collector(manifest: stub(packages: []))
    sized = stub(size: 7)
    sized.expects(:count).never
    counted = stub(size: nil, count: 4)
    raised_size = stub(count: 5)
    raised_size.stubs(:size).raises("size unavailable")
    unreadable = stub
    unreadable.stubs(:size).raises("size unavailable")
    unreadable.stubs(:count).raises("count unavailable")

    assert_equal(7, subject.send(:length_of, stub(records: sized), :records))
    assert_equal(4, subject.send(:length_of, stub(records: counted), :records))
    assert_equal(5, subject.send(:length_of, stub(records: raised_size), :records))
    assert_equal(0, subject.send(:length_of, stub(records: unreadable), :records))
  end

  private

  def collector(manifest:, locations: nil)
    RubyLens::Index::DeclarationCollector.new(
      manifest: manifest,
      locations: locations || RubyLens::Index::LocationIndex.new(manifest),
    )
  end
end
