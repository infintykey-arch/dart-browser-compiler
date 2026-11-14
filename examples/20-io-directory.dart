import 'dart:io';

void main() {
  final dir = Directory('demo');
  dir.createSync(recursive: true);
  File('demo/a.txt').writeAsStringSync('A');
  File('demo/b.txt').writeAsStringSync('B');
  for (final entry in dir.listSync()) {
    print(entry.path);
  }
}
