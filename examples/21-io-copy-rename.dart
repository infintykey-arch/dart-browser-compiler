import 'dart:io';

void main() {
  final original = File('original.txt');
  original.writeAsStringSync('copy me');
  final duplicate = original.copySync('copy.txt');
  duplicate.renameSync('renamed.txt');
  print(File('renamed.txt').readAsStringSync());
  File('renamed.txt').deleteSync();
}
